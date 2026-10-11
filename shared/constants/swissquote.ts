import type { Hex } from '@metamask/utils';
import { REMOTE_CONTROL_GAS_STATION } from './remote-control';

export type SwissquoteGasStation = {
  /** Display name of the sponsor. */
  name: string;
  /**
   * ERC-4337 bundler + ERC-7677 paymaster endpoint (public, no API key).
   * Candide and Pimlico serve both from one URL.
   */
  rpcUrl: string;
  /** The paymaster contract that pays the gas. */
  paymasterAddress: Hex;
};

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
  // Monad mainnet: the Pimlico gas station from `remote-control.ts` (the same
  // one that sponsors the recovery setup; needs
  // REMOTE_CONTROL_GAS_STATION_RPC_URL in `.metamaskrc`).
  ...(REMOTE_CONTROL_GAS_STATION
    ? {
        '0x8f': {
          ...REMOTE_CONTROL_GAS_STATION,
          name: 'Swissquote gas station (Pimlico)',
        },
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
