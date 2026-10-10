import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Hex } from '@metamask/utils';
import { getPreferences } from '../../../../../shared/lib/selectors/preferences';
import { getSwissquoteGasStation } from '../../../../../shared/constants/swissquote';
import { setGasSponsorshipOptOut } from '../../../../store/actions';
import { useDispatch } from '../../../../store/hooks';

/**
 * Hook to read and write the per-chain gas sponsorship opt-out preference.
 *
 * When a user opts out of gas sponsorship on a given chain, their preference
 * is persisted so future transactions on the same chain default to paying
 * with the native token instead of using sponsorship.
 *
 * @param chainId - The chain ID to check the preference for.
 * @returns An object containing:
 * - `isSponsorshipOptedOut`: Whether the user has opted out of gas sponsorship for this chain.
 * - `setSponsorshipOptedOut`: Function to set the opt-out preference for this chain.
 */
export function useGasSponsorshipPreference(chainId: Hex | undefined) {
  const dispatch = useDispatch();
  const { gasSponsorshipOptOutByChainId } = useSelector(getPreferences);

  // Swissquote Wallet: on networks with a Swissquote gas station, gasless is
  // opt-in (stored as `false`). Elsewhere MetaMask's own rule applies: a
  // transaction MetaMask sponsors (e.g. on Monad) stays sponsored unless the
  // user opts out.
  const hasGasStation = Boolean(getSwissquoteGasStation(chainId));
  const storedOptOut = chainId
    ? gasSponsorshipOptOutByChainId?.[chainId]
    : undefined;
  const isSponsorshipOptedOut = hasGasStation
    ? storedOptOut !== false
    : Boolean(storedOptOut);

  const setSponsorshipOptedOut = useCallback(
    (optOut: boolean) => {
      if (!chainId) {
        return;
      }

      dispatch(
        setGasSponsorshipOptOut({
          ...gasSponsorshipOptOutByChainId,
          [chainId]: optOut,
        }),
      );
    },
    [chainId, dispatch, gasSponsorshipOptOutByChainId],
  );

  return { isSponsorshipOptedOut, setSponsorshipOptedOut };
}
