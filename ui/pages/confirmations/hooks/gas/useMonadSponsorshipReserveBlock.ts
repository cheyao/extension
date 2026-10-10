import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { CHAIN_IDS } from '../../../../../shared/constants/chain-ids';
import { sumHexes } from '../../../../../shared/lib/conversion.utils';
import { MONAD_RESERVE_BALANCE_MON } from '../../../../../shared/lib/monad-reserve-balance';
import { getAccountTrackerControllerAccountsByChainId } from '../../../../../shared/lib/selectors/assets-migration';
import { ConfirmContext } from '../../context/confirm';

const MONAD_CHAIN_IDS = new Set(
  [CHAIN_IDS.MONAD, CHAIN_IDS.MONAD_TESTNET].map((id) => id.toLowerCase()),
);
const MONAD_RESERVE_BALANCE_WEI =
  BigInt(MONAD_RESERVE_BALANCE_MON) * 10n ** 18n;

/**
 * Whether gasless (sponsored) sending must be skipped for the current
 * confirmation because of Monad's reserve balance rule.
 *
 * Sponsored transactions upgrade the account to an EIP-7702 smart account,
 * and on Monad a smart account must keep at least 10 MON after any
 * transaction that spends MON. Sponsors refuse such transactions, so when
 * the transaction would leave less than 10 MON it is sent normally instead,
 * with the user paying the network fee.
 *
 * Safe to call outside a confirmation (returns `false`).
 *
 * @returns True if gasless must not be used for this transaction.
 */
export function useMonadSponsorshipReserveBlock(): boolean {
  const transactionMeta = useContext(ConfirmContext)?.currentConfirmation as
    | TransactionMeta
    | undefined;
  const accountsByChainId = useSelector(
    getAccountTrackerControllerAccountsByChainId,
  );

  const chainId = transactionMeta?.chainId;
  const from = transactionMeta?.txParams?.from;
  if (!chainId || !from || !MONAD_CHAIN_IDS.has(chainId.toLowerCase())) {
    return false;
  }

  const balance = accountsByChainId?.[chainId]?.[toChecksumHexAddress(from)]
    ?.balance as Hex | undefined;
  if (balance === undefined) {
    return false;
  }

  const value = sumHexes(
    (transactionMeta.txParams.value as Hex | undefined) ?? '0x0',
    ...(transactionMeta.nestedTransactions?.map(
      (transaction) => (transaction.value as Hex | undefined) ?? '0x0',
    ) ?? []),
  );

  try {
    const valueInWei = BigInt(value);
    return (
      valueInWei > 0n &&
      BigInt(balance) - valueInWei < MONAD_RESERVE_BALANCE_WEI
    );
  } catch {
    return false;
  }
}
