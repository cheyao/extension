import type { TransactionMeta } from '@metamask/transaction-controller';
import { createProjectLogger, type Hex } from '@metamask/utils';
import { getSwissquoteGasStation } from '../../../../shared/constants/swissquote';
import type { TransactionControllerInitMessenger } from '../../wallet-init/messengers/transaction-controller-messenger';
import {
  publishSponsoredUserOperation,
  type SponsoredUserOperationMessenger,
} from './erc4337-user-operation';

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

  const { transactionHash } = await publishSponsoredUserOperation({
    // The init messenger is a superset of what publishing needs.
    messenger: messenger as SponsoredUserOperationMessenger,
    chainId: chainId as Hex,
    networkClientId,
    from: txParams.from as Hex,
    call: {
      to: txParams.to as Hex,
      value: BigInt(txParams.value ?? '0x0'),
      data: (txParams.data as Hex | undefined) ?? '0x',
    },
    gasStation,
    timeoutMs: USER_OPERATION_RECEIPT_TIMEOUT_MS,
  });

  return { transactionHash };
}
