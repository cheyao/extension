import { Interface } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';
import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  SUSD_CHAIN_ID,
  SUSD_CONTRACT_ADDRESS,
  SUSD_USDC_ADDRESS,
  SUSD_WRAP_GAS_LIMIT,
} from '../../../shared/constants/susd';
import type { SusdConvertMode } from '../../../shared/lib/susd';
import { getSelectedInternalAccount } from '../../../shared/lib/selectors/accounts';
import { CONFIRM_TRANSACTION_ROUTE } from '../../helpers/constants/routes';
import {
  addTransaction,
  findNetworkClientIdByChainId,
} from '../../store/actions';
import { useDispatch } from '../../store/hooks';
import { ensureSusdTokenImported } from './useEnsureSusdToken';

const erc20Interface = new Interface([
  'function approve(address spender, uint256 amount)',
]);
const susdInterface = new Interface([
  'function wrap(uint256 amount)',
  'function unwrap(uint256 amount)',
]);

export type UseSusdConversionResult = {
  /** Queues the transaction(s) and opens the first confirmation screen. */
  startConversion: (mode: SusdConvertMode, amountHex: Hex) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
};

/**
 * Converts USDC <-> sUSD on Monad testnet through MetaMask's normal
 * confirmation screens.
 *
 * - `wrap`: queues `USDC.approve(sUSD, amount)` then `sUSD.wrap(amount)` and
 *   opens the approval first. Confirming the approval moves the user straight
 *   on to the wrap confirmation.
 * - `unwrap`: queues a single `sUSD.unwrap(amount)` (no approval needed, the
 *   wrapper burns the caller's own sUSD).
 *
 * @returns Action to start a conversion plus submission state.
 */
export function useSusdConversion(): UseSusdConversionResult {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const selectedAccount = useSelector(getSelectedInternalAccount);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startConversion = useCallback(
    async (mode: SusdConvertMode, amountHex: Hex) => {
      const from = selectedAccount?.address as Hex | undefined;
      if (!from || !SUSD_CONTRACT_ADDRESS) {
        setError('sUSD is not available for this account');
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const networkClientId =
          await findNetworkClientIdByChainId(SUSD_CHAIN_ID);

        // Keep sUSD in the token list so the converted balance shows up.
        await ensureSusdTokenImported(dispatch, selectedAccount?.id);

        let firstTransactionId: string;
        if (mode === 'wrap') {
          const approval = await addTransaction(
            {
              from,
              to: SUSD_USDC_ADDRESS,
              value: '0x0',
              data: erc20Interface.encodeFunctionData('approve', [
                SUSD_CONTRACT_ADDRESS,
                amountHex,
              ]),
            },
            { networkClientId },
          );
          await addTransaction(
            {
              from,
              to: SUSD_CONTRACT_ADDRESS,
              value: '0x0',
              data: susdInterface.encodeFunctionData('wrap', [amountHex]),
              gas: SUSD_WRAP_GAS_LIMIT,
            },
            { networkClientId },
          );
          firstTransactionId = approval.id;
        } else {
          const unwrap = await addTransaction(
            {
              from,
              to: SUSD_CONTRACT_ADDRESS,
              value: '0x0',
              data: susdInterface.encodeFunctionData('unwrap', [amountHex]),
            },
            { networkClientId },
          );
          firstTransactionId = unwrap.id;
        }

        navigate(`${CONFIRM_TRANSACTION_ROUTE}/${firstTransactionId}`);
      } catch (conversionError) {
        setError(
          conversionError instanceof Error
            ? conversionError.message
            : 'Failed to start conversion',
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, navigate, selectedAccount?.address, selectedAccount?.id],
  );

  return { startConversion, isSubmitting, error };
}
