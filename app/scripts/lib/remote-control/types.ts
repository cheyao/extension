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
  /**
   * Whether the account's EIP-7702 delegation now points at the delegate.
   * Until it does, the recovery keys cannot act on the account.
   */
  isDelegated: boolean;
  /** Why the account was not delegated, when `isDelegated` is `false`. */
  delegationError?: string;
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

/**
 * An unlock request on one of the user's accounts: two recovery keys have
 * signed for `controller`, which may act from the account between
 * `unlockTime` and `expiresAt`, unless the account blocks it first.
 */
export type RemoteControlAccessRequest = {
  /** The targeted account, lowercase. */
  account: Hex;
  /** The RemoteControlDelegate the account is delegated to. */
  delegate: Hex;
  /** Who would gain control, lowercase. */
  controller: Hex;
  /** When the controller may start acting, in Unix seconds. */
  unlockTime: number;
  /** When the controller's access ends, in Unix seconds. */
  expiresAt: number;
};
