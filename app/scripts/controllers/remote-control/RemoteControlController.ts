import {
  BaseController,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  type StateMetadata,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignTypedMessageAction,
} from '@metamask/keyring-controller';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { createProjectLogger, type Hex } from '@metamask/utils';
import {
  createPublicClient,
  custom,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
  type EIP1193Provider,
  type PublicClient,
} from 'viem';
import type { Browser } from 'webextension-polyfill';

import {
  REMOTE_CONTROL_CHAIN_ID,
  REMOTE_CONTROL_CODE_CONFIRM_TIMEOUT_MS,
  REMOTE_CONTROL_CODE_POLL_INTERVAL_MS,
  REMOTE_CONTROL_CREATE2_DEPLOYER,
  REMOTE_CONTROL_DEPLOY_TIMEOUT_MS,
  REMOTE_CONTROL_FALLBACK_RPC_URL,
  REMOTE_CONTROL_GAS_STATION,
} from '../../../../shared/constants/remote-control';
import { isManifestV3 } from '../../../../shared/lib/mv3.utils';
import { t } from '../../../../shared/lib/translate';
import { publishSponsoredUserOperation } from '../../lib/transaction/erc4337-user-operation';
import {
  buildRemoteControlDeployCalldata,
  predictRemoteControlAddress,
} from '../../lib/remote-control/initcode';
import { generateRemoteControlKeys } from '../../lib/remote-control/recovery-keys';
import type {
  RemoteControlAccessRequest,
  RemoteControlAvailability,
  RemoteControlDeployment,
} from '../../lib/remote-control/types';
import type { RemoteControlControllerMethodActions } from './RemoteControlController-method-action-types';

const log = createProjectLogger('remote-control-controller');

/**
 * Where to read Monad state: the wallet's network client, or the public RPC
 * when `networkClientId` is undefined.
 */
type ChainSource = { networkClientId: string | undefined };

/** Alarm that wakes the background to look for unlock requests. */
export const REMOTE_CONTROL_ACCESS_CHECK_ALARM = 'remote-control-access-check';

/**
 * How often to look for unlock requests. The cooldown is 5 minutes, so this
 * leaves the user most of it to react. 30 s is Chrome's minimum alarm period.
 */
const ACCESS_CHECK_INTERVAL_MINUTES = 0.5;

/** Prefix of the notification IDs this controller raises. */
const NOTIFICATION_ID_PREFIX = 'remote-control-access:';

const delegateAbi = parseAbi([
  'function accessState() view returns (address controller, uint64 unlockTime, uint64 expiresAt, uint256 nonce)',
  'function revoke()',
]);

const controllerName = 'RemoteControlController';

/**
 * The actions this controller is allowed to call.
 */
export type RemoteControlControllerAllowedActions =
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListAccountsAction
  | KeyringControllerSignEip7702AuthorizationAction
  | KeyringControllerSignTypedMessageAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction;

export type RemoteControlControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RemoteControlControllerState
>;

export type RemoteControlControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    RemoteControlControllerState
  >;

export type {
  RemoteControlAccessRequest,
  RemoteControlAvailability,
  RemoteControlDeployment,
  RemoteControlRecoveryKey,
} from '../../lib/remote-control/types';

const MESSENGER_EXPOSED_METHODS = [
  'isRemoteControlAvailable',
  'deployRemoteControlDelegate',
  'checkAccessRequests',
  'blockAccessRequest',
] as const;

type Actions =
  | RemoteControlControllerAllowedActions
  | RemoteControlControllerGetStateAction
  | RemoteControlControllerMethodActions;

type Events = RemoteControlControllerStateChangeEvent;

/**
 * The {@link RemoteControlController} messenger.
 */
export type RemoteControlControllerMessenger = Messenger<
  typeof controllerName,
  Actions,
  Events
>;

/**
 * The recovery keys are never part of the state: they exist only for the
 * duration of one deployment call and are returned to the caller, so they
 * never reach the vault or a state log.
 */
export type RemoteControlControllerState = {
  /**
   * Unlock requests that are pending or active on the user's accounts, keyed
   * by lowercase account address. Kept across restarts so each request is
   * notified once.
   */
  remoteControlAccessRequests: Record<string, RemoteControlAccessRequest>;
};

export function getDefaultRemoteControlControllerState(): RemoteControlControllerState {
  return { remoteControlAccessRequests: {} };
}

const metadata: StateMetadata<RemoteControlControllerState> = {
  remoteControlAccessRequests: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

/**
 * Deploys the remote-control delegate so a new wallet has 2-of-3 recovery
 * custody of its own account, and watches the user's accounts for unlock
 * requests made with those keys, so the user can block one during its
 * cooldown.
 */
export class RemoteControlController extends BaseController<
  typeof controllerName,
  RemoteControlControllerState,
  RemoteControlControllerMessenger
> {
  readonly #extension: Browser | undefined;

  #interval: ReturnType<typeof setInterval> | undefined;

  #isChecking = false;

  /**
   * Creates a new instance of the RemoteControlController.
   *
   * @param options - The options.
   * @param options.messenger - The controller messenger.
   * @param options.state - Initial state.
   * @param options.extension - The browser extension API. When given, the
   * controller watches for unlock requests in the background and raises
   * browser notifications.
   */
  constructor({
    messenger,
    state,
    extension,
  }: {
    messenger: RemoteControlControllerMessenger;
    state?: Partial<RemoteControlControllerState>;
    extension?: Browser;
  }) {
    super({
      messenger,
      name: controllerName,
      state: { ...getDefaultRemoteControlControllerState(), ...state },
      metadata,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#extension = extension;
    if (extension && REMOTE_CONTROL_GAS_STATION) {
      this.#startWatching(extension);
    }
  }

  destroy() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
    super.destroy();
  }

  /**
   * Looks for unlock requests on every account, records them, and raises a
   * notification for each one not seen before.
   *
   * An unlock request lives in the account's own storage (the account is
   * delegated to its RemoteControlDelegate), so reading `accessState()` is
   * enough; no event log scan is needed.
   *
   * @returns The current requests.
   */
  async checkAccessRequests(): Promise<
    Record<string, RemoteControlAccessRequest>
  > {
    if (this.#isChecking) {
      return this.state.remoteControlAccessRequests;
    }
    this.#isChecking = true;
    try {
      const client = this.#getReadClient();
      const accounts = this.messenger
        .call('AccountsController:listAccounts')
        .filter((account) => account.type === 'eip155:eoa')
        .map((account) => account.address.toLowerCase() as Hex);

      const { timestamp } = await client.getBlock();
      const found: Record<string, RemoteControlAccessRequest> = {};
      await Promise.all(
        accounts.map(async (account) => {
          const request = await this.#readAccessRequest(
            client,
            account,
            Number(timestamp),
          );
          if (request) {
            found[account] = request;
          }
        }),
      );

      const previous = this.state.remoteControlAccessRequests;
      const fresh = Object.values(found).filter(
        (request) =>
          previous[request.account]?.unlockTime !== request.unlockTime ||
          previous[request.account]?.controller !== request.controller,
      );

      this.update((state) => {
        state.remoteControlAccessRequests = found;
      });

      for (const request of fresh) {
        log('New unlock request', request);
        this.#notify(request).catch((error) =>
          log('Showing unlock notification failed', error),
        );
      }
      return found;
    } catch (error) {
      log('Checking unlock requests failed', error);
      return this.state.remoteControlAccessRequests;
    } finally {
      this.#isChecking = false;
    }
  }

  /**
   * Blocks an unlock request by calling `revoke()` from the account itself,
   * which clears the pending or active access and invalidates every
   * outstanding signature. Sponsored, so it works on an account with no MON.
   *
   * @param account - The account the request targets.
   * @returns The transaction that revoked it.
   */
  async blockAccessRequest(account: Hex): Promise<{ transactionHash: Hex }> {
    const gasStation = REMOTE_CONTROL_GAS_STATION;
    if (!gasStation) {
      throw new Error(
        'Sponsored transactions are not configured for this build',
      );
    }
    const from = getAddress(account);
    const networkClientId = this.#findNetworkClientId();

    // No `implementation`: the account is already delegated to its
    // RemoteControlDelegate, which publishing keeps.
    const { transactionHash } = await publishSponsoredUserOperation({
      messenger: this.messenger,
      chainId: REMOTE_CONTROL_CHAIN_ID,
      networkClientId,
      rpcUrl: REMOTE_CONTROL_FALLBACK_RPC_URL,
      from,
      call: {
        to: from,
        data: encodeFunctionData({ abi: delegateAbi, functionName: 'revoke' }),
      },
      gasStation,
      timeoutMs: REMOTE_CONTROL_DEPLOY_TIMEOUT_MS,
    });

    // Confirm on a node that has caught up, then refresh the state.
    const cleared = await this.#pollSources(networkClientId, async (client) => {
      const [controller] = await client.readContract({
        address: from,
        abi: delegateAbi,
        functionName: 'accessState',
      });
      return controller === zeroAddress;
    });
    if (cleared === null) {
      throw new Error(
        `The block transaction ${transactionHash} was included, but the request still shows as active. Check it on a block explorer.`,
      );
    }

    this.update((state) => {
      delete state.remoteControlAccessRequests[from.toLowerCase()];
    });
    return { transactionHash };
  }

  /**
   * Starts the background check: an alarm on MV3, which wakes the service
   * worker, and a plain interval on MV2.
   *
   * @param extension - The browser extension API.
   */
  #startWatching(extension: Browser) {
    if (isManifestV3) {
      extension.alarms.onAlarm.addListener((alarm: { name: string }) => {
        if (alarm.name === REMOTE_CONTROL_ACCESS_CHECK_ALARM) {
          this.checkAccessRequests().catch(() => undefined);
        }
      });
      extension.alarms.create(REMOTE_CONTROL_ACCESS_CHECK_ALARM, {
        periodInMinutes: ACCESS_CHECK_INTERVAL_MINUTES,
      });
    } else {
      this.#interval = setInterval(
        () => this.checkAccessRequests().catch(() => undefined),
        ACCESS_CHECK_INTERVAL_MINUTES * 60_000,
      );
    }

    extension.notifications.onClicked.addListener((id: string) => {
      if (id.startsWith(NOTIFICATION_ID_PREFIX)) {
        extension.tabs
          .create({ url: extension.runtime.getURL('home.html') })
          .catch(() => undefined);
      }
    });

    // Check once at startup rather than waiting for the first alarm.
    setTimeout(() => this.checkAccessRequests().catch(() => undefined), 5_000);
  }

  /**
   * Reads one account's unlock request, if it has a pending or active one.
   *
   * @param client - Client to read through.
   * @param account - The account.
   * @param now - The chain's current time, in seconds.
   * @returns The request, or `undefined`.
   */
  async #readAccessRequest(
    client: PublicClient,
    account: Hex,
    now: number,
  ): Promise<RemoteControlAccessRequest | undefined> {
    const code = (await client.getCode({ address: account }))?.toLowerCase();
    if (!code?.startsWith('0xef0100') || code.length !== 48) {
      return undefined;
    }
    let state;
    try {
      state = await client.readContract({
        address: account,
        abi: delegateAbi,
        functionName: 'accessState',
      });
    } catch {
      // Delegated to something that is not a RemoteControlDelegate.
      return undefined;
    }
    const [controller, unlockTime, expiresAt] = state;
    if (controller === zeroAddress || now >= Number(expiresAt)) {
      return undefined;
    }
    return {
      account,
      delegate: `0x${code.slice(8)}` as Hex,
      controller: controller.toLowerCase() as Hex,
      unlockTime: Number(unlockTime),
      expiresAt: Number(expiresAt),
    };
  }

  /**
   * Raises a browser notification for an unlock request.
   *
   * @param request - The request.
   */
  async #notify(request: RemoteControlAccessRequest) {
    if (!this.#extension) {
      return;
    }
    const isActive = Date.now() / 1000 >= request.unlockTime;
    await this.#extension.notifications.create(
      `${NOTIFICATION_ID_PREFIX}${request.account}:${request.unlockTime}`,
      {
        type: 'basic',
        iconUrl: this.#extension.runtime.getURL('../../images/icon-64.png'),
        title: t('remoteControlAccessNotificationTitle') ?? '',
        message:
          t(
            isActive
              ? 'remoteControlAccessNotificationActive'
              : 'remoteControlAccessNotificationPending',
            shortenAddress(request.account),
            new Date(request.unlockTime * 1000).toLocaleTimeString(),
          ) ?? '',
      },
    );
  }

  /**
   * A client for reading Monad state: the wallet's network client if it has
   * one, otherwise the public RPC.
   *
   * @returns The client.
   */
  #getReadClient(): PublicClient {
    const networkClientId = this.#findNetworkClientId();
    return createPublicClient({
      chain: defineChain({
        id: Number.parseInt(REMOTE_CONTROL_CHAIN_ID, 16),
        name: 'Monad',
        nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
        rpcUrls: { default: { http: [REMOTE_CONTROL_FALLBACK_RPC_URL] } },
      }),
      transport: networkClientId
        ? custom(
            this.messenger.call(
              'NetworkController:getNetworkClientById',
              networkClientId,
            ).provider as unknown as EIP1193Provider,
          )
        : http(REMOTE_CONTROL_FALLBACK_RPC_URL),
    });
  }

  /**
   * Whether this build can perform a remote-control deployment. Callers use
   * this to decide between running the onboarding step and skipping it.
   *
   * @returns Whether the feature is configured.
   */
  isRemoteControlAvailable(): RemoteControlAvailability {
    return { isConfigured: Boolean(REMOTE_CONTROL_GAS_STATION) };
  }

  /**
   * Generates three recovery keys, deploys the remote-control delegate with
   * them baked in as immutables, and returns both the keys and the deployed
   * address.
   *
   * The deployment is sponsored by the configured paymaster, so the account
   * needs no MON — which matters because this runs during wallet creation,
   * where the account is brand new and empty.
   *
   * @returns The deployment result. The private keys are not retained by the
   * controller after this returns.
   */
  async deployRemoteControlDelegate(): Promise<RemoteControlDeployment> {
    const gasStation = REMOTE_CONTROL_GAS_STATION;
    if (!gasStation) {
      throw new Error(
        'Remote control deployment is not configured for this build',
      );
    }

    const keys = generateRemoteControlKeys();

    const selectedAccount = await this.messenger.call(
      'AccountsController:getSelectedAccount',
    );
    if (!selectedAccount) {
      throw new Error('Remote control deployment requires a selected account');
    }
    const from = getAddress(selectedAccount.address);

    const networkClientId = this.#findNetworkClientId();

    const delegateAddress = predictRemoteControlAddress(keys);

    log('Deploying remote-control delegate', {
      from,
      delegateAddress,
      networkClientId: networkClientId ?? REMOTE_CONTROL_FALLBACK_RPC_URL,
    });

    // A user operation can only CALL, so the creation goes through the
    // canonical CREATE2 deployer rather than a call to the zero address.
    const { transactionHash } = await publishSponsoredUserOperation({
      messenger: this.messenger,
      chainId: REMOTE_CONTROL_CHAIN_ID,
      networkClientId,
      rpcUrl: REMOTE_CONTROL_FALLBACK_RPC_URL,
      from,
      call: {
        to: REMOTE_CONTROL_CREATE2_DEPLOYER,
        data: buildRemoteControlDeployCalldata(keys),
      },
      gasStation,
      timeoutMs: REMOTE_CONTROL_DEPLOY_TIMEOUT_MS,
    });

    // From here on the delegate may exist, so the keys must reach the user no
    // matter what: throwing would discard the only copy. Later failures are
    // reported alongside the keys instead.
    const codeSource = await this.#pollSources(networkClientId, (client) =>
      client
        .getCode({ address: delegateAddress })
        .then((code) => Boolean(code && code !== '0x')),
    );
    const isCodeConfirmed = codeSource !== null;

    let isDelegated = false;
    let delegationError: string | undefined;
    if (codeSource === null) {
      delegationError =
        'The recovery contract could not be seen on-chain yet, so the wallet was not switched to it.';
    } else {
      try {
        isDelegated = await this.#delegateTo({
          from,
          delegateAddress,
          gasStation,
          // Use the RPC that has already seen the deployment, so the account
          // nonce read for the authorization is current.
          source: codeSource,
        });
        if (!isDelegated) {
          delegationError =
            'The wallet was not switched to the recovery contract: its delegation did not change on-chain.';
        }
      } catch (error) {
        log('Delegating to the remote-control delegate failed', error);
        delegationError = `The wallet was not switched to the recovery contract. ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    log('Remote-control delegate deployed', {
      delegateAddress,
      transactionHash,
      isCodeConfirmed,
      isDelegated,
      delegationError,
    });

    return {
      delegateAddress,
      transactionHash,
      isCodeConfirmed,
      isDelegated,
      ...(delegationError ? { delegationError } : {}),
      keys,
    };
  }

  /**
   * Switches the account's EIP-7702 delegation to the remote-control delegate,
   * which is what makes the recovery keys effective: the delegate's logic only
   * runs as the account's own code. The delegate is also an ERC-4337 account,
   * so sponsored transactions keep working afterwards.
   *
   * @param args - Arguments.
   * @param args.from - The account.
   * @param args.delegateAddress - The deployed delegate.
   * @param args.gasStation - The sponsor.
   * @param args.source - Where to read chain state.
   * @returns Whether the delegation is confirmed on-chain.
   */
  async #delegateTo({
    from,
    delegateAddress,
    gasStation,
    source,
  }: {
    from: Hex;
    delegateAddress: Hex;
    gasStation: NonNullable<typeof REMOTE_CONTROL_GAS_STATION>;
    source: ChainSource;
  }): Promise<boolean> {
    // A no-op self call: the user operation exists only to carry the
    // authorization.
    await publishSponsoredUserOperation({
      messenger: this.messenger,
      chainId: REMOTE_CONTROL_CHAIN_ID,
      networkClientId: source.networkClientId,
      rpcUrl: REMOTE_CONTROL_FALLBACK_RPC_URL,
      from,
      call: { to: from },
      gasStation,
      timeoutMs: REMOTE_CONTROL_DEPLOY_TIMEOUT_MS,
      implementation: delegateAddress,
    });

    const expected = `0xef0100${delegateAddress.slice(2).toLowerCase()}`;
    const confirmed = await this.#pollSources(
      source.networkClientId,
      (client) =>
        client
          .getCode({ address: from })
          .then((code) => code?.toLowerCase() === expected),
    );
    return confirmed !== null;
  }

  /**
   * Finds the wallet's network client for Monad, if it has one.
   *
   * @returns The network client ID, or `undefined` to use the public RPC.
   */
  #findNetworkClientId(): string | undefined {
    try {
      return this.messenger.call(
        'NetworkController:findNetworkClientIdByChainId',
        REMOTE_CONTROL_CHAIN_ID,
      );
    } catch (error) {
      log('No Monad network client; using the public RPC', error);
      return undefined;
    }
  }

  /**
   * Polls a condition on the wallet's Monad RPC and the public one until
   * either satisfies it. RPC nodes can lag the bundler's node by a few blocks.
   *
   * @param networkClientId - The wallet's network client, if any.
   * @param check - The condition.
   * @returns The source that satisfied it, or `null` on timeout.
   */
  async #pollSources(
    networkClientId: string | undefined,
    check: (client: PublicClient) => Promise<boolean>,
  ): Promise<ChainSource | null> {
    const chain = defineChain({
      id: Number.parseInt(REMOTE_CONTROL_CHAIN_ID, 16),
      name: 'Monad',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [REMOTE_CONTROL_FALLBACK_RPC_URL] } },
    });
    const sources: (ChainSource & { client: PublicClient })[] = [
      ...(networkClientId
        ? [
            {
              networkClientId,
              client: createPublicClient({
                chain,
                transport: custom(
                  this.messenger.call(
                    'NetworkController:getNetworkClientById',
                    networkClientId,
                  ).provider as unknown as EIP1193Provider,
                ),
              }),
            },
          ]
        : []),
      {
        networkClientId: undefined,
        client: createPublicClient({
          chain,
          transport: http(REMOTE_CONTROL_FALLBACK_RPC_URL),
        }),
      },
    ];

    const deadline = Date.now() + REMOTE_CONTROL_CODE_CONFIRM_TIMEOUT_MS;
    for (;;) {
      for (const { client, ...source } of sources) {
        try {
          if (await check(client)) {
            return source;
          }
        } catch (error) {
          log('Reading chain state failed; retrying', error);
        }
      }
      if (Date.now() >= deadline) {
        return null;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, REMOTE_CONTROL_CODE_POLL_INTERVAL_MS),
      );
    }
  }
}

/**
 * Shortens an address for display, as `0x1234…abcd`.
 *
 * @param address - The address.
 * @returns The shortened address.
 */
function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
