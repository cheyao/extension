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

  // Swissquote Wallet: gasless is only available on networks with a
  // Swissquote gas station, and is opt-in there (stored as `false`). Everywhere
  // else the user pays the network fee, so nothing reaches MetaMask's relay.
  const hasGasStation = Boolean(getSwissquoteGasStation(chainId));
  const isSponsorshipOptedOut =
    !hasGasStation ||
    !chainId ||
    gasSponsorshipOptOutByChainId?.[chainId] !== false;

  const setSponsorshipOptedOut = useCallback(
    (optOut: boolean) => {
      if (!chainId || !hasGasStation) {
        return;
      }

      dispatch(
        setGasSponsorshipOptOut({
          ...gasSponsorshipOptOutByChainId,
          [chainId]: optOut,
        }),
      );
    },
    [chainId, dispatch, gasSponsorshipOptOutByChainId, hasGasStation],
  );

  return { isSponsorshipOptedOut, setSponsorshipOptedOut };
}
