import { decodeAuthorizationSignature } from '@metamask/transaction-controller';
import { createProjectLogger, type Hex } from '@metamask/utils';
import type { EventConstraint, Messenger } from '@metamask/messenger';
import type {
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignTypedMessageAction,
} from '@metamask/keyring-controller';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import {
  BaseError,
  createPublicClient,
  custom,
  defineChain,
  getTypesForEIP712Domain,
  http,
  parseAbi,
  type EIP1193Provider,
  type PublicClient,
} from 'viem';
import { toAccount } from 'viem/accounts';
import {
  createBundlerClient,
  createPaymasterClient,
  toSimple7702SmartAccount,
} from 'viem/account-abstraction';

const log = createProjectLogger('erc4337-user-operation');

/**
 * Who sponsors a user operation: an ERC-4337 bundler + ERC-7677 paymaster
 * service served from one URL (`rpcUrl`). The paymaster pays the gas, so the
 * sending account needs no native token.
 */
export type GasStation = {
  /** Display name of the sponsor. */
  name: string;
  /** Bundler + paymaster service endpoint. */
  rpcUrl: string;
  /** The paymaster contract that pays the gas. */
  paymasterAddress: Hex;
};

/**
 * The minimum messenger surface needed to publish a sponsored user operation.
 * Both the Swissquote publish hook and the remote-control deployment satisfy
 * it, which is what lets them share this module.
 */
export type SponsoredUserOperationMessenger = Messenger<
  string,
  | KeyringControllerSignTypedMessageAction
  | KeyringControllerSignEip7702AuthorizationAction
  | NetworkControllerGetNetworkClientByIdAction,
  EventConstraint
>;

/**
 * A single call made by the user operation.
 */
export type SponsoredUserOperationCall = {
  /**
   * Call target. A user operation can only CALL, so to deploy a contract call
   * a CREATE2 deployer with the initcode as `data`.
   */
  to: Hex;
  /** Native value to forward. Defaults to 0. */
  value?: bigint | undefined;
  /** Calldata. Defaults to `0x`. */
  data?: Hex | undefined;
};

/**
 * The result of a published user operation.
 */
export type SponsoredUserOperationResult = {
  /** The hash of the on-chain transaction that included the operation. */
  transactionHash: Hex;
  /** The ERC-4337 user operation hash, for tracking. */
  userOperationHash: Hex;
};

/**
 * The ERC-4337 v0.8 EntryPoint, which every account used here validates
 * against.
 */
const ENTRY_POINT_V08 = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

const remoteControlProbeAbi = parseAbi([
  'function entryPoint() view returns (address)',
  'function accessState() view returns (address, uint64, uint64, uint256)',
]);

/**
 * Returns the address an EIP-7702 delegated account points at, or `undefined`
 * if the account has no delegation.
 *
 * @param code - The account's code.
 * @returns The delegation target.
 */
function getDelegationTarget(code: Hex | undefined): Hex | undefined {
  const lower = code?.toLowerCase();
  return lower?.startsWith('0xef0100') && lower.length === 48
    ? (`0x${lower.slice(8)}` as Hex)
    : undefined;
}

/**
 * Whether `account` is delegated to a RemoteControlDelegate, which is a
 * Simple7702Account-compatible ERC-4337 account that also carries the
 * wallet's recovery. Such a delegation must be kept: replacing it would
 * silently remove the wallet's recovery.
 *
 * @param client - Client to read through.
 * @param account - The delegated account.
 * @returns Whether the delegation is a RemoteControlDelegate.
 */
async function isRemoteControlDelegation(
  client: PublicClient,
  account: Hex,
): Promise<boolean> {
  try {
    const [entryPoint] = await Promise.all([
      client.readContract({
        address: account,
        abi: remoteControlProbeAbi,
        functionName: 'entryPoint',
      }),
      client.readContract({
        address: account,
        abi: remoteControlProbeAbi,
        functionName: 'accessState',
      }),
    ]);
    return entryPoint.toLowerCase() === ENTRY_POINT_V08.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Reduces an error to the most specific human-readable reason it carries.
 * viem errors wrap the RPC's own message several layers deep, under a long
 * dump of the request arguments, so `message` alone is not useful to show.
 *
 * @param error - The error.
 * @returns A one-line reason.
 */
export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    const innermost = error.walk() as BaseError | Error;
    if (innermost instanceof BaseError) {
      return innermost.details || innermost.shortMessage;
    }
    return innermost.message || error.shortMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Runs one step of publishing, labelling any failure with that step so the
 * user can tell where it went wrong and why.
 *
 * @param step - What the step does, phrased to precede ": <reason>".
 * @param fn - The step.
 * @returns The step's result.
 */
async function runStep<Result>(
  step: string,
  fn: () => Promise<Result>,
): Promise<Result> {
  try {
    return await fn();
  } catch (error) {
    log(`${step} failed`, error);
    throw new Error(`${step}: ${describeError(error)}`, { cause: error });
  }
}

/**
 * Builds the viem owner account whose signatures are produced by the
 * KeyringController, exactly as for any other wallet signature. The user
 * operation flow only ever signs EIP-712 typed data, so the other two signing
 * entry points are unreachable and throw rather than silently doing nothing.
 *
 * @param from - The address that owns the account.
 * @param messenger - Messenger used to request signatures.
 * @returns A viem account that delegates signing to the KeyringController.
 */
function createKeyringOwnerAccount(
  from: Hex,
  messenger: SponsoredUserOperationMessenger,
) {
  return toAccount({
    address: from,
    async signMessage() {
      throw new Error('Sponsored user operation: message signing is not used');
    },
    async signTransaction() {
      throw new Error(
        'Sponsored user operation: transaction signing is not used',
      );
    },
    async signTypedData(typedData) {
      const { domain, types, primaryType, message } = typedData as {
        domain?: Record<string, unknown>;
        types: Record<string, unknown>;
        primaryType: string;
        message: Record<string, unknown>;
      };
      const data = JSON.parse(
        JSON.stringify(
          {
            domain: domain ?? {},
            types: {
              EIP712Domain: getTypesForEIP712Domain({ domain }),
              ...types,
            },
            primaryType,
            message,
          },
          (_key, item) =>
            typeof item === 'bigint' ? `0x${item.toString(16)}` : item,
        ),
      );
      return (await messenger.call(
        'KeyringController:signTypedMessage',
        { from, data: data as Record<string, unknown>[] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'V4' as any,
      )) as Hex;
    },
  });
}

/**
 * Sends a transaction gasless: as an ERC-4337 user operation from `from`
 * (upgraded via EIP-7702 to `Simple7702Account` if needed), with the gas paid
 * by the gas station's paymaster. Signing happens in the KeyringController,
 * like any other signature, so the private key never leaves the vault.
 *
 * @param args - Arguments.
 * @param args.messenger - Messenger used for signing and for the RPC client.
 * @param args.chainId - Hex chain ID the operation runs on.
 * @param args.networkClientId - Network client to read chain state through.
 * @param args.rpcUrl - Public RPC to read chain state through when the wallet
 * has no network client for the chain. Ignored if `networkClientId` is set.
 * @param args.from - The account the operation runs from.
 * @param args.call - The single call to execute. See
 * {@link SponsoredUserOperationCall} for how to deploy a contract.
 * @param args.gasStation - The bundler + paymaster endpoint.
 * @param args.timeoutMs - How long to wait for inclusion.
 * @param args.implementation - The Simple7702Account-compatible contract to
 * delegate the account to. When omitted, an existing RemoteControlDelegate
 * delegation is kept and anything else is upgraded to Simple7702Account.
 * @returns The user operation hash and its including transaction hash.
 */
export async function publishSponsoredUserOperation({
  messenger,
  chainId,
  networkClientId,
  rpcUrl,
  from,
  call,
  gasStation,
  timeoutMs,
  implementation: requestedImplementation,
}: {
  messenger: SponsoredUserOperationMessenger;
  chainId: Hex;
  networkClientId?: string | undefined;
  rpcUrl?: string | undefined;
  from: Hex;
  call: SponsoredUserOperationCall;
  gasStation: GasStation;
  timeoutMs: number;
  implementation?: Hex | undefined;
}): Promise<SponsoredUserOperationResult> {
  const chainIdNumber = Number.parseInt(chainId, 16);

  let transport;
  if (networkClientId) {
    const { provider } = messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    transport = custom(provider as unknown as EIP1193Provider);
  } else if (rpcUrl) {
    transport = http(rpcUrl);
  } else {
    throw new Error(`No RPC available for chain ${chainId}`);
  }
  const chain = defineChain({
    id: chainIdNumber,
    name: gasStation.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
  const client = createPublicClient({
    chain,
    transport,
  });

  const currentTarget = getDelegationTarget(
    await runStep('Could not read the account from the network', () =>
      client.getCode({ address: from }),
    ),
  );

  let implementation = requestedImplementation;
  if (
    !implementation &&
    currentTarget &&
    (await isRemoteControlDelegation(client as PublicClient, from))
  ) {
    implementation = currentTarget;
  }

  const account = await runStep('Could not set up the smart account', () =>
    toSimple7702SmartAccount({
      client,
      owner: createKeyringOwnerAccount(from, messenger),
      implementation,
    }),
  );

  // Delegate the account with EIP-7702 unless it already points at the
  // implementation (delegated code is 0xef0100 || address).
  const isDelegated =
    currentTarget === account.authorization.address.toLowerCase();

  let authorization;
  if (!isDelegated) {
    const nonce = await runStep(
      'Could not read the account nonce from the network',
      () => client.getTransactionCount({ address: from, blockTag: 'pending' }),
    );
    const signature = await runStep(
      'Could not sign the account upgrade',
      async () =>
        (await messenger.call('KeyringController:signEip7702Authorization', {
          chainId: chainIdNumber,
          contractAddress: account.authorization.address,
          from,
          nonce,
        })) as Hex,
    );
    const { r, s, yParity } = decodeAuthorizationSignature(signature);
    authorization = {
      address: account.authorization.address,
      chainId: chainIdNumber,
      nonce,
      r,
      s,
      yParity: Number.parseInt(yParity, 16),
    };
  }

  const bundlerTransport = http(gasStation.rpcUrl);
  const paymaster = createPaymasterClient({ transport: bundlerTransport });

  const bundler = createBundlerClient({
    account,
    chain,
    client,
    transport: bundlerTransport,
    paymaster,
    userOperation: {
      // Prefer the bundler's own gas price quote (Pimlico requires its
      // minimum); fall back to the network's fee estimate.
      async estimateFeesPerGas() {
        try {
          const prices = (await bundlerTransport({ chain }).request({
            method: 'pimlico_getUserOperationGasPrice',
          } as never)) as {
            fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          };
          return {
            maxFeePerGas: BigInt(prices.fast.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(prices.fast.maxPriorityFeePerGas),
          };
        } catch {
          return await client.estimateFeesPerGas();
        }
      },
    },
  });

  log('Sending sponsored user operation', {
    from,
    to: call.to,
    gasStation: gasStation.name,
    implementation: account.authorization.address,
    upgrading: !isDelegated,
  });

  const userOperationHash = await runStep(
    `${gasStation.name} did not accept the sponsored transaction`,
    () =>
      bundler.sendUserOperation({
        authorization,
        calls: [
          {
            to: call.to,
            value: call.value ?? BigInt(0),
            data: call.data ?? '0x',
          },
        ],
      }),
  );

  const receipt = await runStep(
    `Sponsored transaction was not confirmed within ${Math.round(
      timeoutMs / 1000,
    )}s (user operation ${userOperationHash})`,
    () =>
      bundler.waitForUserOperationReceipt({
        hash: userOperationHash,
        timeout: timeoutMs,
      }),
  );

  log('Sponsored user operation included', {
    userOperationHash,
    success: receipt.success,
    transactionHash: receipt.receipt.transactionHash,
  });

  if (!receipt.success) {
    throw new Error(
      `Sponsored transaction reverted${
        receipt.reason ? `: ${receipt.reason}` : ''
      } (transaction ${receipt.receipt.transactionHash})`,
    );
  }

  return {
    userOperationHash,
    transactionHash: receipt.receipt.transactionHash,
  };
}
