import type { Hex } from '@metamask/utils';

/**
 * One of the three recovery keys deployed into the remote-control delegate.
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
 * What a successful deployment produced.
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

/**
 * Whether this build can perform a remote-control deployment.
 */
export type RemoteControlAvailability = {
  /** Whether the build has a gas station configured for the deployment. */
  isConfigured: boolean;
};
