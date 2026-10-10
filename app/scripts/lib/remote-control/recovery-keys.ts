import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { REMOTE_CONTROL_KEY_COUNT } from '../../../../shared/constants/remote-control';
import type { RemoteControlRecoveryKey } from './types';

/**
 * Generates the three recovery keys that get baked into the remote-control
 * delegate as immutables.
 *
 * The contract's constructor reverts unless all three addresses are non-zero
 * and pairwise distinct, so the set is validated here rather than discovering
 * the failure in a deployment that has already cost gas.
 *
 * @returns The three keys, labelled `A` / `B` / `C`.
 */
export function generateRemoteControlKeys(): [
  RemoteControlRecoveryKey,
  RemoteControlRecoveryKey,
  RemoteControlRecoveryKey,
] {
  const labels = ['A', 'B', 'C'] as const;
  const keys = labels.map((label) => {
    const privateKey = generatePrivateKey();
    return {
      label,
      privateKey,
      address: privateKeyToAccount(privateKey).address,
    };
  });

  const seen = new Set(keys.map((key) => key.address.toLowerCase()));
  if (seen.size !== REMOTE_CONTROL_KEY_COUNT) {
    throw new Error(
      'Generated recovery keys are not distinct; refusing to deploy',
    );
  }

  return keys as [
    RemoteControlRecoveryKey,
    RemoteControlRecoveryKey,
    RemoteControlRecoveryKey,
  ];
}
