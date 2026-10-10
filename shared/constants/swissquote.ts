import type { Hex } from '@metamask/utils';
import { REMOTE_CONTROL_GAS_STATION } from './remote-control';

/**
 * Addresses of your `SwissquoteGasStation` paymaster contracts (owner: the
 * sponsor's phone wallet), deployed with
 * `development/swissquote/gas-station/setup.html`. Paste the address the page
 * shows in step 4 ("Predicted address" once it says Deployed) — not the smart
 * account contract from step 2. While undefined, gasless on that network falls
 * back to MetaMask's own sponsorship.
 */
export const SWISSQUOTE_MONAD_GAS_STATION: Hex | undefined = undefined;
export const SWISSQUOTE_MONAD_TESTNET_GAS_STATION: Hex | undefined = undefined;

export type SwissquoteGasStation = {
  /** Display name of the sponsor. */
  name: string;
  /**
   * ERC-4337 bundler + ERC-7677 paymaster endpoint (public, no API key).
   * Candide serves both from one URL. Unused with `paymasterContract`.
   */
  rpcUrl: string;
  /** The paymaster contract that pays the gas. */
  paymasterAddress: Hex;
  /**
   * `true` when `paymasterAddress` is a `SwissquoteGasStation` contract: user
   * operations go to `bundlerUrl` with the contract as paymaster.
   */
  paymasterContract?: boolean;
  /** ERC-4337 bundler endpoint, used with `paymasterContract`. */
  bundlerUrl?: string;
};

/**
 * A `SwissquoteGasStation` contract on Monad, sent through Pimlico's public
 * bundler (no API key).
 *
 * @param address - The deployed gas station contract.
 * @param chainIdDecimal - Chain ID for the bundler URL.
 * @returns The gas station config.
 */
function monadGasStation(
  address: Hex,
  chainIdDecimal: number,
): SwissquoteGasStation {
  return {
    name: 'Swissquote gas station',
    rpcUrl: `https://public.pimlico.io/v2/${chainIdDecimal}/rpc`,
    bundlerUrl: `https://public.pimlico.io/v2/${chainIdDecimal}/rpc`,
    paymasterAddress: address,
    paymasterContract: true,
  };
}

/**
 * Networks where gasless transactions are available, and the gas station
 * that sponsors them.
 *
 * Gasless transactions are sent as ERC-4337 user operations from the user's
 * own account, upgraded with EIP-7702 to the standard `Simple7702Account`
 * (EntryPoint v0.8). The paymaster pays the gas, so the account needs no ETH.
 */
export const SWISSQUOTE_GAS_STATIONS: Record<Hex, SwissquoteGasStation> = {
  // Sepolia — Candide public paymaster.
  '0xaa36a7': {
    name: 'Candide public paymaster',
    rpcUrl: 'https://api.candide.dev/public/v3/11155111',
    paymasterAddress: '0xa8151918eac3818deb713d3dbbb7930329fe86ed',
  },
  // Monad mainnet — a deployed Swissquote gas station contract if set,
  // otherwise the Pimlico gas station from `remote-control.ts` (the same one
  // that sponsors the recovery setup; needs REMOTE_CONTROL_GAS_STATION_RPC_URL
  // in `.metamaskrc`).
  ...(SWISSQUOTE_MONAD_GAS_STATION
    ? { '0x8f': monadGasStation(SWISSQUOTE_MONAD_GAS_STATION, 143) }
    : {}),
  ...(!SWISSQUOTE_MONAD_GAS_STATION && REMOTE_CONTROL_GAS_STATION
    ? {
        '0x8f': {
          ...REMOTE_CONTROL_GAS_STATION,
          name: 'Swissquote gas station (Pimlico)',
        },
      }
    : {}),
  ...(SWISSQUOTE_MONAD_TESTNET_GAS_STATION
    ? {
        '0x279f': monadGasStation(SWISSQUOTE_MONAD_TESTNET_GAS_STATION, 10143),
      }
    : {}),
};

/**
 * Returns the gas station for a network, if gasless transactions are
 * available on it.
 *
 * @param chainId - Hex chain ID.
 * @returns The gas station, or undefined.
 */
export function getSwissquoteGasStation(
  chainId?: string | null,
): SwissquoteGasStation | undefined {
  return chainId
    ? SWISSQUOTE_GAS_STATIONS[chainId.toLowerCase() as Hex]
    : undefined;
}
