import {
  BaseController,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
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
  getAddress,
  http,
  type EIP1193Provider,
} from 'viem';

import {
  REMOTE_CONTROL_CHAIN_ID,
  REMOTE_CONTROL_CODE_CONFIRM_TIMEOUT_MS,
  REMOTE_CONTROL_CODE_POLL_INTERVAL_MS,
  REMOTE_CONTROL_CREATE2_DEPLOYER,
  REMOTE_CONTROL_DEPLOY_TIMEOUT_MS,
  REMOTE_CONTROL_FALLBACK_RPC_URL,
  REMOTE_CONTROL_GAS_STATION,
} from '../../../../shared/constants/remote-control';
import { publishSponsoredUserOperation } from '../../lib/transaction/erc4337-user-operation';
import {
  buildRemoteControlDeployCalldata,
  predictRemoteControlAddress,
} from '../../lib/remote-control/initcode';
import { generateRemoteControlKeys } from '../../lib/remote-control/recovery-keys';
import type {
  RemoteControlAvailability,
  RemoteControlDeployment,
} from '../../lib/remote-control/types';
import type { RemoteControlControllerMethodActions } from './RemoteControlController-method-action-types';

const log = createProjectLogger('remote-control-controller');

const controllerName = 'RemoteControlController';

/**
 * The actions this controller is allowed to call.
 */
export type RemoteControlControllerAllowedActions =
  | AccountsControllerGetSelectedAccountAction
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
  RemoteControlAvailability,
  RemoteControlDeployment,
  RemoteControlRecoveryKey,
} from '../../lib/remote-control/types';

const MESSENGER_EXPOSED_METHODS = [
  'isRemoteControlAvailable',
  'deployRemoteControlDelegate',
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
 * The controller holds no state: the recovery keys exist only for the duration
 * of one deployment call and are returned to the caller rather than stored, so
 * they never reach the vault or a state log.
 */
export type RemoteControlControllerState = Record<string, never>;

const metadata = {};

/**
 * Deploys the remote-control delegate so a new wallet has 2-of-3 recovery
 * custody of its own account.
 *
 * The controller is deliberately stateless: it exists to perform one gasless
 * deployment per wallet creation and hand the resulting private keys straight
 * back to the caller.
 */
export class RemoteControlController extends BaseController<
  typeof controllerName,
  RemoteControlControllerState,
  RemoteControlControllerMessenger
> {
  /**
   * Creates a new instance of the RemoteControlController.
   *
   * @param options - The options.
   * @param options.messenger - The controller messenger.
   */
  constructor({ messenger }: { messenger: RemoteControlControllerMessenger }) {
    super({
      messenger,
      name: controllerName,
      state: {},
      metadata,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
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
    // matter what: throwing would discard the only copy. RPC nodes can lag the
    // bundler's node by a few blocks, so a missing code read is reported as
    // unconfirmed rather than as a failure.
    const isCodeConfirmed = await this.#waitForCode(
      networkClientId,
      delegateAddress,
    );

    log('Remote-control delegate deployed', {
      delegateAddress,
      transactionHash,
      isCodeConfirmed,
    });

    return { delegateAddress, transactionHash, isCodeConfirmed, keys };
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
   * Polls until contract code is visible at the delegate's address, on the
   * wallet's Monad RPC or the public one, whichever catches up first.
   *
   * @param networkClientId - The wallet's network client, if any.
   * @param delegateAddress - Where the delegate should be.
   * @returns Whether the code was seen before giving up.
   */
  async #waitForCode(
    networkClientId: string | undefined,
    delegateAddress: Hex,
  ): Promise<boolean> {
    const chain = defineChain({
      id: Number.parseInt(REMOTE_CONTROL_CHAIN_ID, 16),
      name: 'Monad',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [REMOTE_CONTROL_FALLBACK_RPC_URL] } },
    });
    const transports = [
      ...(networkClientId
        ? [
            custom(
              this.messenger.call(
                'NetworkController:getNetworkClientById',
                networkClientId,
              ).provider as unknown as EIP1193Provider,
            ),
          ]
        : []),
      http(REMOTE_CONTROL_FALLBACK_RPC_URL),
    ];
    const clients = transports.map((transport) =>
      createPublicClient({ chain, transport }),
    );

    const deadline = Date.now() + REMOTE_CONTROL_CODE_CONFIRM_TIMEOUT_MS;
    for (;;) {
      for (const client of clients) {
        try {
          const code = await client.getCode({ address: delegateAddress });
          if (code && code !== '0x') {
            return true;
          }
        } catch (error) {
          log('Reading delegate code failed; retrying', error);
        }
      }
      if (Date.now() >= deadline) {
        log('Delegate code not visible yet', { delegateAddress });
        return false;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, REMOTE_CONTROL_CODE_POLL_INTERVAL_MS),
      );
    }
  }
}
