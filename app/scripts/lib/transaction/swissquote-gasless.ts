import {
  decodeAuthorizationSignature,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { createProjectLogger, type Hex } from '@metamask/utils';
import {
  createPublicClient,
  custom,
  defineChain,
  getTypesForEIP712Domain,
  http,
  type EIP1193Provider,
} from 'viem';
import { toAccount } from 'viem/accounts';
import {
  createBundlerClient,
  createPaymasterClient,
  toSimple7702SmartAccount,
} from 'viem/account-abstraction';
import { getSwissquoteGasStation } from '../../../../shared/constants/swissquote';
import type { TransactionControllerInitMessenger } from '../../wallet-init/messengers/transaction-controller-messenger';

const log = createProjectLogger('swissquote-gasless');

const USER_OPERATION_RECEIPT_TIMEOUT_MS = 120_000;

/**
 * Whether a transaction should be sent gasless through a Swissquote gas
 * station: the user chose "Gasless" on a network that has one. The UI marks
 * such transactions as sponsored and externally signed (no local signature).
 *
 * @param transactionMeta - The transaction.
 * @returns True if it should go through the gas station.
 */
export function isSwissquoteGaslessTransaction(
  transactionMeta: TransactionMeta,
): boolean {
  return Boolean(
    getSwissquoteGasStation(transactionMeta.chainId) &&
    transactionMeta.isGasFeeSponsored &&
    transactionMeta.isExternalSign,
  );
}

function stringifyBigInts(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? `0x${item.toString(16)}` : item,
    ),
  );
}

/**
 * Sends a transaction gasless: as an ERC-4337 user operation from the user's
 * account (upgraded via EIP-7702 to `Simple7702Account` if needed), with the
 * gas paid by the network's Swissquote gas station. Signing happens in the
 * KeyringController, like any other signature.
 *
 * @param args - Arguments.
 * @param args.transactionMeta - The transaction to send.
 * @param args.messenger - The TransactionController init messenger.
 * @returns The hash of the on-chain transaction that included the operation.
 */
export async function publishSwissquoteGasless({
  transactionMeta,
  messenger,
}: {
  transactionMeta: TransactionMeta;
  messenger: TransactionControllerInitMessenger;
}): Promise<{ transactionHash: string }> {
  const { chainId, networkClientId, txParams } = transactionMeta;
  const gasStation = getSwissquoteGasStation(chainId);
  if (!gasStation) {
    throw new Error(`No Swissquote gas station for chain ${chainId}`);
  }

  const from = txParams.from as Hex;

  // The user operation does not use the account's transaction nonce, so drop
  // the one the controller assigned; otherwise the local nonce tracker would
  // treat it as used and later transactions would leave a nonce gap.
  if (txParams.nonce !== undefined) {
    const { nonce: _nonce, ...txParamsWithoutNonce } = txParams;
    await messenger.call(
      'TransactionController:updateTransaction',
      { ...transactionMeta, txParams: txParamsWithoutNonce },
      'Remove nonce for Swissquote gasless user operation',
    );
  }

  const { provider } = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );
  const chain = defineChain({
    id: Number.parseInt(chainId, 16),
    name: gasStation.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
  const client = createPublicClient({
    chain,
    transport: custom(provider as unknown as EIP1193Provider),
  });

  // The user's account, with signing done by the KeyringController.
  const owner = toAccount({
    address: from,
    async signMessage() {
      throw new Error('Swissquote gasless: message signing is not used');
    },
    async signTransaction() {
      throw new Error('Swissquote gasless: transaction signing is not used');
    },
    async signTypedData(typedData) {
      const { domain, types, primaryType, message } = typedData as {
        domain?: Record<string, unknown>;
        types: Record<string, unknown>;
        primaryType: string;
        message: Record<string, unknown>;
      };
      const data = stringifyBigInts({
        domain: domain ?? {},
        types: {
          EIP712Domain: getTypesForEIP712Domain({ domain }),
          ...types,
        },
        primaryType,
        message,
      });
      return (await messenger.call(
        'KeyringController:signTypedMessage',
        { from, data: data as Record<string, unknown>[] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'V4' as any,
      )) as Hex;
    },
  });

  const account = await toSimple7702SmartAccount({ client, owner });

  // Upgrade the account with EIP-7702 unless it already points at the
  // Simple7702Account implementation (delegated code is 0xef0100 || address).
  const implementation = account.authorization.address.toLowerCase();
  const code = (await client.getCode({ address: from }))?.toLowerCase();
  const isDelegated = code === `0xef0100${implementation.slice(2)}`;

  let authorization;
  if (!isDelegated) {
    const nonce = await client.getTransactionCount({
      address: from,
      blockTag: 'pending',
    });
    const signature = (await messenger.call(
      'KeyringController:signEip7702Authorization',
      {
        chainId: Number.parseInt(chainId, 16),
        contractAddress: account.authorization.address,
        from,
        nonce,
      },
    )) as Hex;
    const { r, s, yParity } = decodeAuthorizationSignature(signature);
    authorization = {
      address: account.authorization.address,
      chainId: Number.parseInt(chainId, 16),
      nonce,
      r,
      s,
      yParity: Number.parseInt(yParity, 16),
    };
  }

  const bundler = createBundlerClient({
    account,
    chain,
    client,
    transport: http(gasStation.rpcUrl),
    paymaster: createPaymasterClient({ transport: http(gasStation.rpcUrl) }),
  });

  log('Sending gasless user operation', {
    from,
    to: txParams.to,
    gasStation: gasStation.name,
    upgrading: !isDelegated,
  });

  const userOperationHash = await bundler.sendUserOperation({
    authorization,
    calls: [
      {
        to: txParams.to as Hex,
        value: BigInt(txParams.value ?? '0x0'),
        data: (txParams.data as Hex | undefined) ?? '0x',
      },
    ],
  });

  const receipt = await bundler.waitForUserOperationReceipt({
    hash: userOperationHash,
    timeout: USER_OPERATION_RECEIPT_TIMEOUT_MS,
  });

  log('Gasless user operation included', {
    userOperationHash,
    success: receipt.success,
    transactionHash: receipt.receipt.transactionHash,
  });

  if (!receipt.success) {
    throw new Error(
      `Gasless transaction reverted (user operation ${userOperationHash})`,
    );
  }

  return { transactionHash: receipt.receipt.transactionHash };
}
