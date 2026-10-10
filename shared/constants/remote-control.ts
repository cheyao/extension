import type { Hex } from '@metamask/utils';
import { CHAIN_IDS } from './chain-ids';

/**
 * The chain the remote-control delegate is deployed to.
 */
export const REMOTE_CONTROL_CHAIN_ID = CHAIN_IDS.MONAD;

/**
 * Public RPC used to read Monad state when the wallet has no Monad network
 * client yet. Freshly created wallets do not necessarily have Monad added.
 */
export const REMOTE_CONTROL_FALLBACK_RPC_URL = 'https://rpc.monad.xyz';

/**
 * The ERC-7677 paymaster that sponsors the deployment, for display and
 * reference. The bundler and the paymaster are served from the same URL.
 */
export const REMOTE_CONTROL_PAYMASTER_ADDRESS =
  '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402' as Hex;

/**
 * The bundled endpoint that sponsors the remote-control deployment.
 *
 * Injected at build time from `REMOTE_CONTROL_GAS_STATION_RPC_URL` (see
 * `.metamaskrc`) rather than hardcoded, so the API key stays out of the
 * repository. When it is absent the whole feature is inert: the onboarding
 * step redirects onward without deploying, and no keys are generated.
 */
const GAS_STATION_RPC_URL = process.env.REMOTE_CONTROL_GAS_STATION_RPC_URL;

/**
 * The gas station sponsoring remote-control deployments, or `undefined` when
 * the build has no endpoint configured.
 */
export const REMOTE_CONTROL_GAS_STATION = GAS_STATION_RPC_URL
  ? {
      name: 'Pimlico',
      rpcUrl: GAS_STATION_RPC_URL,
      paymasterAddress: REMOTE_CONTROL_PAYMASTER_ADDRESS,
    }
  : undefined;

/**
 * How long to wait for the deployment's user operation to be included before
 * giving up. The delegate is ~3.6 KB of runtime code, so the paymaster's
 * validation and bundler inclusion budget is larger than for a transfer.
 */
export const REMOTE_CONTROL_DEPLOY_TIMEOUT_MS = 180_000;

/**
 * How long to keep polling for the delegate's code after the deployment was
 * included, and how often. RPC nodes can lag the bundler's node.
 */
export const REMOTE_CONTROL_CODE_CONFIRM_TIMEOUT_MS = 30_000;
export const REMOTE_CONTROL_CODE_POLL_INTERVAL_MS = 2_000;

/**
 * The number of recovery keys the delegate requires. The contract reverts in
 * its constructor unless all three are non-zero and pairwise distinct.
 */
export const REMOTE_CONTROL_KEY_COUNT = 3;

/**
 * The canonical Arachnid CREATE2 deployer, present at the same address on most
 * EVM chains (verified on Monad mainnet).
 *
 * The deployment goes through this rather than a plain `CREATE` because a user
 * operation can only make `CALL`s, never `CREATE`s: calling `address(0)` is a
 * no-op that silently succeeds. This contract's fallback takes raw
 * `salt ++ initcode` calldata with no selector and performs a real CREATE2,
 * which also makes the delegate's address deterministic.
 */
export const REMOTE_CONTROL_CREATE2_DEPLOYER =
  '0x4e59b44847b379578588920cA78FbF26c0B4956C' as Hex;

/**
 * CREATE2 salt for the deployment. Fixed so that the same keys always produce
 * the same delegate address on every chain.
 */
export const REMOTE_CONTROL_CREATE2_SALT = `0x${'00'.repeat(32)}` as Hex;
