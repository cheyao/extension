import type { Hex } from '@metamask/utils';
import { CHAIN_IDS } from './chain-ids';

/**
 * sUSD is a 1:1 wrapper around USDC (see SUSD.sol), live on Monad testnet only.
 * Unaudited demo contract: keep it testnet-only.
 */
export const SUSD_CHAIN_ID = CHAIN_IDS.MONAD_TESTNET;

/** Circle's official USDC on Monad testnet. */
export const SUSD_USDC_ADDRESS: Hex =
  '0x534b2f3A21130d7a60830c2Df862319e593943A3';

/**
 * Address of the deployed sUSD wrapper on Monad testnet (wraps the USDC above).
 * Deployed in tx 0xb1bc8aa2485bd74425bf76e8666fef79ca382d0873b8e38a882beeecd574b281.
 * Set to `null` to hide the "Convert to sUSD" UI.
 */
export const SUSD_CONTRACT_ADDRESS: Hex | null =
  '0x904c714fa5b7471bfa2a868bc5d59b48f8241e57';

/** sUSD uses the same decimals as USDC so the wrap is exactly 1:1. */
export const SUSD_DECIMALS = 6;

/** Token symbol and name, as set in the SUSD.sol constructor. */
export const SUSD_SYMBOL = 'sUSD';
export const SUSD_NAME = 'Wrapped USD';

/**
 * Fixed gas limit for `wrap`. The wrap transaction is queued behind the USDC
 * approval, so gas estimation at queue time would revert (allowance is still
 * zero). 200k comfortably covers transferFrom + mint with cold storage.
 */
export const SUSD_WRAP_GAS_LIMIT: Hex = '0x30d40';
