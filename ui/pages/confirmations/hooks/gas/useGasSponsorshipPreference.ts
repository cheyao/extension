import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Hex } from '@metamask/utils';
import { getPreferences } from '../../../../../shared/lib/selectors/preferences';
import { setGasSponsorshipOptOut } from '../../../../store/actions';
import { useDispatch } from '../../../../store/hooks';
import { useMonadSponsorshipReserveBlock } from './useMonadSponsorshipReserveBlock';
import { getSwissquoteGasStation } from '../../../../../shared/constants/swissquote';

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

  // Swissquote Wallet: gasless is opt-in on every network (stored as
  // `false` once the user picks "Gasless"); "Pay gas fee" is the default, so
  // nothing is sent through a sponsor unless the user asked for it.
  const storedOptOut = chainId
    ? gasSponsorshipOptOutByChainId?.[chainId]
    : undefined;
  // Only networks with a Swissquote gas station offer gasless; MetaMask's
  // own relay ("Paid by MetaMask") cannot send there, so it is never used.
  const hasGasStation = Boolean(getSwissquoteGasStation(chainId));
  const isOptedOutByUser = !hasGasStation || storedOptOut !== false;

  // On Monad a sponsored (EIP-7702) account must keep 10 MON after spending
  // MON; such transactions are refused by every sponsor, so pay gas instead.
  const isBlockedByMonadReserve = useMonadSponsorshipReserveBlock();
  const isSponsorshipOptedOut = isOptedOutByUser || isBlockedByMonadReserve;

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

  return {
    isSponsorshipOptedOut,
    isBlockedByMonadReserve,
    setSponsorshipOptedOut,
  };
}
