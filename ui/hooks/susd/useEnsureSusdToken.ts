import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { CaipChainId, Hex } from '@metamask/utils';
import {
  SUSD_CHAIN_ID,
  SUSD_CONTRACT_ADDRESS,
  SUSD_DECIMALS,
  SUSD_NAME,
  SUSD_SYMBOL,
} from '../../../shared/constants/susd';
import { toAssetId } from '../../../shared/lib/asset-utils';
import { getSelectedInternalAccount } from '../../../shared/lib/selectors/accounts';
import {
  addImportedTokens,
  findNetworkClientIdByChainId,
  importCustomAssetsBatch,
} from '../../store/actions';
import type { MetaMaskReduxDispatch } from '../../store/store';
import { useDispatch } from '../../store/hooks';

type TokenState = {
  metamask: {
    allTokens?: Record<string, Record<string, { address: string }[]>>;
    allIgnoredTokens?: Record<string, Record<string, string[]>>;
  };
};

/**
 * Adds sUSD (Monad testnet) to the account's tokens, the same way a manual
 * "Import tokens" does: the TokensController list plus the AssetsController
 * custom assets, so it shows on the home page and in token management.
 *
 * Errors are logged and swallowed so callers (e.g. the conversion flow) can
 * continue if the import fails.
 *
 * @param dispatch - Redux dispatch (thunk-capable).
 * @param accountId - Internal account id, for the AssetsController entry.
 */
export async function ensureSusdTokenImported(
  dispatch: MetaMaskReduxDispatch,
  accountId?: string,
): Promise<void> {
  if (!SUSD_CONTRACT_ADDRESS) {
    return;
  }
  try {
    const networkClientId = await findNetworkClientIdByChainId(SUSD_CHAIN_ID);
    await Promise.resolve(
      dispatch(
        addImportedTokens(
          [
            {
              address: SUSD_CONTRACT_ADDRESS,
              symbol: SUSD_SYMBOL,
              decimals: SUSD_DECIMALS,
              name: SUSD_NAME,
            },
          ],
          networkClientId,
        ),
      ),
    );

    const assetId = toAssetId(
      SUSD_CONTRACT_ADDRESS,
      SUSD_CHAIN_ID as CaipChainId | Hex,
    );
    if (accountId && assetId) {
      await Promise.resolve(
        dispatch(
          importCustomAssetsBatch(accountId, [{ assetId, isHidden: false }], {
            [assetId]: {
              address: SUSD_CONTRACT_ADDRESS,
              symbol: SUSD_SYMBOL,
              name: SUSD_NAME,
              decimals: SUSD_DECIMALS,
              chainId: SUSD_CHAIN_ID,
            },
          }),
        ),
      );
    }
  } catch (error) {
    console.warn('[sUSD] Failed to add sUSD to the token list:', error);
  }
}

/**
 * Makes sure sUSD stays in the selected account's token list: imports it once
 * if it is missing, unless the user deliberately hid it.
 */
export function useEnsureSusdToken(): void {
  const dispatch = useDispatch();
  const account = useSelector(getSelectedInternalAccount);
  const address = account?.address?.toLowerCase();

  const isPresentOrHidden = useSelector((state: TokenState) => {
    if (!SUSD_CONTRACT_ADDRESS || !address) {
      return true;
    }
    const susd = SUSD_CONTRACT_ADDRESS.toLowerCase();
    const matchesAccount = (key: string) => key.toLowerCase() === address;
    const tokens = Object.entries(
      state.metamask.allTokens?.[SUSD_CHAIN_ID] ?? {},
    ).find(([key]) => matchesAccount(key))?.[1];
    const ignored = Object.entries(
      state.metamask.allIgnoredTokens?.[SUSD_CHAIN_ID] ?? {},
    ).find(([key]) => matchesAccount(key))?.[1];
    return Boolean(
      tokens?.some((token) => token.address.toLowerCase() === susd) ||
      ignored?.some((ignoredAddress) => ignoredAddress.toLowerCase() === susd),
    );
  });

  useEffect(() => {
    if (!isPresentOrHidden) {
      ensureSusdTokenImported(dispatch, account?.id);
    }
    // Run when the account changes or sUSD goes missing from its list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresentOrHidden, address]);
}
