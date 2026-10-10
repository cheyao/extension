import {
  concatHex,
  encodeAbiParameters,
  getCreate2Address,
  type Hex,
} from 'viem';

import { REMOTE_CONTROL_DELEGATE_CREATION_CODE } from '../../../../shared/constants/remote-control-contract';
import {
  REMOTE_CONTROL_CREATE2_DEPLOYER,
  REMOTE_CONTROL_CREATE2_SALT,
} from '../../../../shared/constants/remote-control';
import type { RemoteControlRecoveryKey } from './types';

/**
 * Builds the delegate's initcode: its creation bytecode followed by the ABI
 * encoding of the three recovery-key addresses, which the constructor stores
 * as immutables.
 *
 * @param keys - The three recovery keys.
 * @returns The initcode to execute as a contract creation.
 */
export function buildRemoteControlInitcode(
  keys: RemoteControlRecoveryKey[],
): Hex {
  return concatHex([
    REMOTE_CONTROL_DELEGATE_CREATION_CODE,
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
      [keys[0].address, keys[1].address, keys[2].address],
    ),
  ]);
}

/**
 * Builds the calldata for the canonical CREATE2 deployer.
 *
 * That contract is raw fallback bytecode (`0x7fffffff…`), not a dispatched
 * contract: it reads the calldata as `salt ++ initcode` with no function
 * selector and no ABI encoding. Sending ABI-encoded `deploy(bytes32,bytes)`
 * instead would shift every byte and deploy nothing while still reporting
 * success.
 *
 * @param keys - The three recovery keys.
 * @returns Calldata that makes the deployer perform the CREATE2.
 */
export function buildRemoteControlDeployCalldata(
  keys: RemoteControlRecoveryKey[],
): Hex {
  return concatHex([
    REMOTE_CONTROL_CREATE2_SALT,
    buildRemoteControlInitcode(keys),
  ]);
}

/**
 * Computes where the delegate will land, without waiting for inclusion.
 *
 * The Arachnid deployer emits no `Created` event, so the address cannot be
 * recovered from the receipt and has to be derived.
 *
 * @param keys - The three recovery keys.
 * @returns The deterministic delegate address.
 */
export function predictRemoteControlAddress(
  keys: RemoteControlRecoveryKey[],
): Hex {
  return getCreate2Address({
    from: REMOTE_CONTROL_CREATE2_DEPLOYER,
    bytecode: buildRemoteControlInitcode(keys),
    salt: REMOTE_CONTROL_CREATE2_SALT,
  });
}