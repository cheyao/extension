import type { Hex } from '@metamask/utils';

/**
 * One of the three recovery keys deployed into the remote-control delegate.
 *
 * Mirrors the background controller's type so the UI can consume the result of
 * a deployment without reaching across into `app/scripts`.
 */
export type RemoteControlRecoveryKey = {
  /** `A`, `B` or `C`, matching the contract's `KEY_A` / `KEY_B` / `KEY_C`. */
  label: 'A' | 'B' | 'C';
  /** The private key. Shown once and never persisted. */
  privateKey: Hex;
  /** The address baked into the deployed contract as the immutable. */
  address: Hex;
};

/**
 * The result of deploying the remote-control delegate during wallet creation.
 */
export type RemoteControlDeployment = {
  /** Where the delegate was deployed. */
  delegateAddress: Hex;
  /** The transaction that included the deployment. */
  transactionHash: Hex;
  /**
   * Whether the delegate's code was seen on-chain. `false` means the
   * deployment was included but no RPC showed the code before the controller
   * stopped polling; the keys are returned regardless.
   */
  isCodeConfirmed: boolean;
  /** The three recovery keys, in `A` / `B` / `C` order. */
  keys: [
    RemoteControlRecoveryKey,
    RemoteControlRecoveryKey,
    RemoteControlRecoveryKey,
  ];
};
