import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  isAddress,
  isHex,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { TOKEN_API_METASWAP_CODEFI_URL } from '../../constants/tokens';
import {
  REMOTE_CONTROL_CHAIN_ID,
  REMOTE_CONTROL_FALLBACK_RPC_URL,
} from '../../constants/remote-control';

/**
 * Recovers a wallet protected by a RemoteControlDelegate: two recovery keys
 * grant `controller` access, and once the 5-minute cooldown has passed the
 * controller moves every token it can find in the wallet to itself.
 *
 * Runs entirely in the page that calls it. The private keys are only used to
 * sign locally and are never sent anywhere.
 */

const delegateAbi = parseAbi([
  'function requestAccess(address controller, uint256 deadline, bytes sigA, bytes sigB)',
  'function execute((address target, uint256 value, bytes data)[] calls) payable',
  'function accessState() view returns (address controller, uint64 unlockTime, uint64 expiresAt, uint256 nonce)',
  'error NotAuthorized()',
  'error SignatureExpired()',
  'error NotEnoughDistinctKeys()',
  'error NotAKey()',
  'error CallFailed(uint256 index, bytes returndata)',
]);

const REVERT_REASONS: Record<string, string> = {
  NotAKey: 'One of the two recovery keys does not belong to this wallet.',
  NotEnoughDistinctKeys: 'Both signatures come from the same recovery key.',
  SignatureExpired: 'The signature deadline has passed. Try again.',
  NotAuthorized:
    'The controller does not have access to this wallet (yet, or any more).',
};

/**
 * On Monad, an EIP-7702 delegated account cannot be brought below 10 MON:
 * such transactions revert. This much MON has to stay in the wallet.
 * https://docs.monad.xyz/developer-essentials/reserve-balance
 */
export const MONAD_DELEGATED_RESERVE_WEI =
  BigInt(10) * BigInt(10) ** BigInt(18);

const POLL_INTERVAL_MS = 5_000;

export type RecoveryInput = {
  recoveryKey1: string;
  recoveryKey2: string;
  controller: string;
  controllerPrivateKey: string;
  destination: string;
  /** ERC-20 addresses to check in addition to the known token list. */
  extraTokens?: string[];
};

export type RecoveryProgress =
  | { step: 'checking' }
  | { step: 'requesting' }
  | {
      step: 'waiting';
      requestTransactionHash?: Hex;
      unlockTime: number;
      secondsLeft: number;
    }
  | { step: 'finding-tokens' }
  | { step: 'transferring'; assetCount: number };

export type RecoveredAsset = {
  /** Token contract, or `native` for MON. */
  token: Address | 'native';
  symbol: string;
  amount: string;
};

export type RecoveryResult = {
  requestTransactionHash?: Hex;
  transferTransactionHash?: Hex;
  transferred: RecoveredAsset[];
  /** Tokens whose transfer reverted, so they were left behind. */
  skipped: RecoveredAsset[];
  /** MON left in the wallet because of Monad's delegated-account reserve. */
  reserveLeft: string;
};

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryError';
  }
}

type Asset = RecoveredAsset & { raw: bigint };

function parsePrivateKey(name: string, value: string): Hex {
  const trimmed = value.trim();
  const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!isHex(key) || key.length !== 66) {
    throw new RecoveryError(`${name} is not a 32-byte private key.`);
  }
  return key;
}

function parseAddress(name: string, value: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) {
    throw new RecoveryError(`${name} is not a valid address.`);
  }
  return getAddress(trimmed);
}

function describeError(error: unknown): string {
  if (error instanceof RecoveryError) {
    return error.message;
  }
  if (error instanceof BaseError) {
    const revert = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError,
    );
    const name =
      revert instanceof ContractFunctionRevertedError
        ? revert.data?.errorName
        : undefined;
    if (name) {
      return REVERT_REASONS[name] ?? `The contract rejected it (${name}).`;
    }
    const innermost = error.walk() as BaseError | Error;
    return innermost instanceof BaseError
      ? innermost.details || innermost.shortMessage
      : innermost.message || error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new RecoveryError('Recovery was cancelled.'));
      },
      { once: true },
    );
  });
}

type ParsedRecoveryInput = {
  recoveryKey1: Hex;
  recoveryKey2: Hex;
  controller: Address;
  controllerPrivateKey: Hex;
  destination: Address;
  extraTokens: Address[];
};

/**
 * Validates the input without touching the network.
 *
 * The two recovery keys must be distinct (the delegate rejects two signatures
 * from the same key), and the controller private key must belong to the
 * controller address, because the same key both requests access and later
 * executes the sweep.
 *
 * @param input - What the user entered.
 * @returns The parsed values.
 */
export function validateRecoveryInput(
  input: RecoveryInput,
): ParsedRecoveryInput {
  const recoveryKey1 = parsePrivateKey('Recovery key 1', input.recoveryKey1);
  const recoveryKey2 = parsePrivateKey('Recovery key 2', input.recoveryKey2);
  if (
    privateKeyToAccount(recoveryKey1).address.toLowerCase() ===
    privateKeyToAccount(recoveryKey2).address.toLowerCase()
  ) {
    throw new RecoveryError(
      'The two recovery keys are the same key. Use two of the three distinct recovery keys.',
    );
  }

  const controller = parseAddress('Controller', input.controller);
  const controllerPrivateKey = parsePrivateKey(
    'Controller private key',
    input.controllerPrivateKey,
  );
  if (
    privateKeyToAccount(controllerPrivateKey).address.toLowerCase() !==
    controller.toLowerCase()
  ) {
    throw new RecoveryError(
      'The controller private key does not match the controller address.',
    );
  }

  const destination = parseAddress('Destination', input.destination);
  const extraTokens = (input.extraTokens ?? []).map((token, index) =>
    parseAddress(`Extra token ${index + 1}`, token),
  );

  return {
    recoveryKey1,
    recoveryKey2,
    controller,
    controllerPrivateKey,
    destination,
    extraTokens,
  };
}

const accessRequestTypedData = (
  chainId: number,
  destination: Address,
  controller: Address,
  nonce: bigint,
  deadline: bigint,
) =>
  ({
    domain: {
      name: 'RemoteControlDelegate',
      version: '1',
      chainId,
      verifyingContract: destination,
    },
    types: {
      AccessRequest: [
        { name: 'controller', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'AccessRequest',
    message: { controller, nonce, deadline },
  }) as const;

/**
 * The index of the call that reverted, when `execute` failed with
 * `CallFailed(index, returndata)`. Used to drop a single unmovable token and
 * retry the rest rather than failing the whole sweep.
 *
 * @param error - The error thrown by `simulateContract`.
 * @returns The failing call's index, or `undefined` for any other revert.
 */
function callFailedIndex(error: unknown): number | undefined {
  if (!(error instanceof BaseError)) {
    return undefined;
  }
  const revert = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  );
  if (
    !(revert instanceof ContractFunctionRevertedError) ||
    revert.data?.errorName !== 'CallFailed'
  ) {
    return undefined;
  }
  const index = revert.data.args?.[0];
  return typeof index === 'bigint' ? Number(index) : undefined;
}

/**
 * Fetches the known ERC-20 token addresses for a chain from the MetaMask token
 * API. Discovery is best-effort: a failed or empty response just means the
 * sweep relies on `extraTokens` plus the native balance.
 *
 * @param chainId - The chain to list tokens for.
 * @param signal - Aborts the request when recovery is cancelled.
 * @returns The checksummed token addresses, or an empty array.
 */
async function fetchKnownTokens(
  chainId: number,
  signal?: AbortSignal,
): Promise<Address[]> {
  try {
    const response = await fetch(`${TOKEN_API_METASWAP_CODEFI_URL}${chainId}`, {
      signal,
    });
    if (!response.ok) {
      return [];
    }
    const list: unknown = await response.json();
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map((token) => (token as { address?: unknown })?.address)
      .filter(
        (address): address is string =>
          typeof address === 'string' && isAddress(address, { strict: false }),
      )
      .map((address) => getAddress(address));
  } catch {
    return [];
  }
}

/**
 * Reads the destination's native balance and every non-zero ERC-20 balance
 * among `tokens`. Tokens with no code, or that are not ERC-20s, are skipped.
 *
 * @param publicClient - A client for the recovery chain.
 * @param destination - The wallet being recovered.
 * @param tokens - Candidate ERC-20 addresses to check.
 * @returns The assets found, native first.
 */
async function findAssets(
  publicClient: PublicClient,
  destination: Address,
  tokens: Address[],
): Promise<Asset[]> {
  const assets: Asset[] = [];

  const nativeBalance = await publicClient.getBalance({ address: destination });
  if (nativeBalance > BigInt(0)) {
    assets.push({
      token: 'native',
      symbol: 'MON',
      amount: formatEther(nativeBalance),
      raw: nativeBalance,
    });
  }

  const found = await Promise.all(
    tokens.map(async (token): Promise<Asset | null> => {
      try {
        const [balance, decimals, symbol] = await Promise.all([
          publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [destination],
          }),
          publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'decimals',
          }),
          publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'symbol',
          }),
        ]);
        if (balance > BigInt(0)) {
          return {
            token,
            symbol,
            amount: formatUnits(balance, decimals),
            raw: balance,
          };
        }
      } catch {
        // Not an ERC-20 at this address on this chain; ignore it.
      }
      return null;
    }),
  );

  for (const asset of found) {
    if (asset) {
      assets.push(asset);
    }
  }
  return assets;
}

/**
 * Recovers a wallet guarded by a RemoteControlDelegate and sweeps its balances
 * to the controller.
 *
 * The flow mirrors the `unlock` + `controller execute` scripts in `recovery-kit`:
 * two of the three recovery keys sign an access request for `controller`, which
 * starts the delegate's cooldown (the wallet owner is alerted and can cancel or
 * revoke it meanwhile); once the cooldown has passed, the controller moves every
 * token it can find, plus the native balance above Monad's delegated-account
 * reserve, into itself.
 *
 * The private keys never leave this function: they are only used to sign and to
 * derive addresses locally.
 *
 * @param input - The two recovery keys, the controller and its key, and the
 * wallet to recover. See {@link RecoveryInput}.
 * @param options - Optional progress callback, abort signal, and RPC override.
 * @param options.onProgress - Called as the recovery moves through its steps.
 * @param options.signal - Aborts the wait/poll loops and token discovery.
 * @param options.rpcUrl - Overrides the default Monad RPC endpoint.
 * @returns What was transferred, what was skipped, and the reserve left behind.
 */
export async function recoverWallet(
  input: RecoveryInput,
  options: {
    onProgress?: (progress: RecoveryProgress) => void;
    signal?: AbortSignal;
    rpcUrl?: string;
  } = {},
): Promise<RecoveryResult> {
  const { onProgress, signal } = options;
  const report = (progress: RecoveryProgress) => onProgress?.(progress);

  const parsed = validateRecoveryInput(input);
  report({ step: 'checking' });

  const rpcUrl = options.rpcUrl ?? REMOTE_CONTROL_FALLBACK_RPC_URL;
  const chainId = await createPublicClient({
    transport: http(rpcUrl),
  }).getChainId();
  const chain = defineChain({
    id: chainId,
    name: `chain ${chainId}`,
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;
  const controllerAccount = privateKeyToAccount(parsed.controllerPrivateKey);
  const walletClient = createWalletClient({
    account: controllerAccount,
    chain,
    transport: http(rpcUrl),
  });

  // The destination must be an EIP-7702 account delegated to a
  // RemoteControlDelegate; the delegate's logic only runs as the account's own
  // code, so without the delegation there is no recovery to perform.
  const code =
    (
      await publicClient.getCode({ address: parsed.destination })
    )?.toLowerCase() ?? '0x';
  if (code === '0x') {
    throw new RecoveryError(
      'This wallet has no recovery delegation on Monad, so there is nothing to recover.',
    );
  }
  if (!code.startsWith('0xef0100') || code.length !== 48) {
    throw new RecoveryError(
      'This address is a contract, not a recoverable delegated wallet.',
    );
  }

  let state;
  try {
    state = await publicClient.readContract({
      address: parsed.destination,
      abi: delegateAbi,
      functionName: 'accessState',
    });
  } catch {
    throw new RecoveryError(
      'This wallet is delegated to a contract that is not a recovery delegate.',
    );
  }
  const [currentController, currentUnlock, currentExpiry, nonce] = state;
  const { timestamp: now } = await publicClient.getBlock();

  let unlockTime = currentUnlock;
  let requestTransactionHash: Hex | undefined;

  const alreadyActive =
    currentController.toLowerCase() === parsed.controller.toLowerCase() &&
    now < currentExpiry;

  if (!alreadyActive) {
    report({ step: 'requesting' });
    const deadline = now + BigInt(3600);
    const typedData = accessRequestTypedData(
      chainId,
      parsed.destination,
      parsed.controller,
      nonce,
      deadline,
    );
    const [sigA, sigB] = await Promise.all([
      privateKeyToAccount(parsed.recoveryKey1).signTypedData(typedData),
      privateKeyToAccount(parsed.recoveryKey2).signTypedData(typedData),
    ]);

    // Simulate first so a wrong key fails here, for free, with a readable reason.
    let request;
    try {
      ({ request } = await publicClient.simulateContract({
        account: controllerAccount,
        address: parsed.destination,
        abi: delegateAbi,
        functionName: 'requestAccess',
        args: [parsed.controller, deadline, sigA, sigB],
      }));
    } catch (error) {
      throw new RecoveryError(describeError(error));
    }

    requestTransactionHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: requestTransactionHash,
    });
    if (receipt.status !== 'success') {
      throw new RecoveryError('The access request transaction failed.');
    }
    const [, newUnlock] = await publicClient.readContract({
      address: parsed.destination,
      abi: delegateAbi,
      functionName: 'accessState',
    });
    unlockTime = newUnlock;
  }

  // Wait out the cooldown by chain time, and abort if the wallet owner cancels
  // or revokes the request meanwhile.
  for (;;) {
    if (signal?.aborted) {
      throw new RecoveryError('Recovery was cancelled.');
    }
    const { timestamp } = await publicClient.getBlock();
    const [controllerNow, unlockNow] = await publicClient.readContract({
      address: parsed.destination,
      abi: delegateAbi,
      functionName: 'accessState',
    });
    if (
      controllerNow.toLowerCase() !== parsed.controller.toLowerCase() ||
      unlockNow !== unlockTime
    ) {
      throw new RecoveryError(
        'The request was cancelled or revoked by the wallet owner during the cooldown.',
      );
    }
    if (timestamp >= unlockTime) {
      report({
        step: 'waiting',
        requestTransactionHash,
        unlockTime: Number(unlockTime),
        secondsLeft: 0,
      });
      break;
    }
    report({
      step: 'waiting',
      requestTransactionHash,
      unlockTime: Number(unlockTime),
      secondsLeft: Number(unlockTime - timestamp),
    });
    await sleep(POLL_INTERVAL_MS, signal);
  }

  // Discover everything the wallet holds.
  report({ step: 'finding-tokens' });
  const knownTokens = await fetchKnownTokens(chainId, signal);
  const uniqueTokens = [
    ...new Map(
      [...knownTokens, ...parsed.extraTokens].map((token) => [
        token.toLowerCase(),
        token,
      ]),
    ).values(),
  ];
  const assets = await findAssets(
    publicClient,
    parsed.destination,
    uniqueTokens,
  );

  // Build one call per asset. Native MON keeps Monad's delegated-account reserve
  // behind, because a transaction that takes a delegated account below it reverts.
  type SweepCall = { target: Address; value: bigint; data: Hex };
  const planned: { call: SweepCall; asset: RecoveredAsset }[] = [];
  let reserveLeft = '0';
  for (const asset of assets) {
    if (asset.token === 'native') {
      const sendable = asset.raw - MONAD_DELEGATED_RESERVE_WEI;
      if (sendable <= BigInt(0)) {
        reserveLeft = formatEther(asset.raw);
        continue;
      }
      reserveLeft = formatEther(MONAD_DELEGATED_RESERVE_WEI);
      planned.push({
        call: { target: parsed.controller, value: sendable, data: '0x' },
        asset: {
          token: 'native',
          symbol: asset.symbol,
          amount: formatEther(sendable),
        },
      });
    } else {
      planned.push({
        call: {
          target: asset.token,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [parsed.controller, asset.raw],
          }),
        },
        asset: {
          token: asset.token,
          symbol: asset.symbol,
          amount: asset.amount,
        },
      });
    }
  }

  if (planned.length === 0) {
    return {
      requestTransactionHash,
      transferred: [],
      skipped: [],
      reserveLeft,
    };
  }

  report({ step: 'transferring', assetCount: planned.length });

  // Simulate the batch, dropping any single call the delegate reports as failing
  // (CallFailed) so one unmovable token does not strand the rest. Whatever
  // survives simulation is executed in a single transaction.
  const skipped: RecoveredAsset[] = [];
  let active = planned;
  let executeRequest;
  for (;;) {
    if (active.length === 0) {
      return { requestTransactionHash, transferred: [], skipped, reserveLeft };
    }
    try {
      ({ request: executeRequest } = await publicClient.simulateContract({
        account: controllerAccount,
        address: parsed.destination,
        abi: delegateAbi,
        functionName: 'execute',
        args: [active.map(({ call }) => call)],
      }));
      break;
    } catch (error) {
      const index = callFailedIndex(error);
      if (index === undefined || index >= active.length) {
        throw new RecoveryError(describeError(error));
      }
      skipped.push(active[index].asset);
      active = active.filter((_, position) => position !== index);
    }
  }

  const transferTransactionHash =
    await walletClient.writeContract(executeRequest);
  const transferReceipt = await publicClient.waitForTransactionReceipt({
    hash: transferTransactionHash,
  });
  if (transferReceipt.status !== 'success') {
    throw new RecoveryError('The transfer transaction failed.');
  }

  return {
    requestTransactionHash,
    transferTransactionHash,
    transferred: active.map(({ asset }) => asset),
    skipped,
    reserveLeft,
  };
}
