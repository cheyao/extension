import {
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  type Hex,
} from 'viem';

import { REMOTE_CONTROL_DELEGATE_CREATION_CODE } from '../../../../shared/constants/remote-control-contract';
import {
  REMOTE_CONTROL_CREATE2_DEPLOYER,
  REMOTE_CONTROL_CREATE2_SALT,
} from '../../../../shared/constants/remote-control';
import {
  buildRemoteControlDeployCalldata,
  buildRemoteControlInitcode,
  predictRemoteControlAddress,
} from './initcode';
import type { RemoteControlRecoveryKey } from './types';

const KEY_A = '0x1111111111111111111111111111111111111111';
const KEY_B = '0x2222222222222222222222222222222222222222';
const KEY_C = '0x3333333333333333333333333333333333333333';

const KEYS: [
  RemoteControlRecoveryKey,
  RemoteControlRecoveryKey,
  RemoteControlRecoveryKey,
] = [
  { label: 'A', privateKey: `0x${'11'.repeat(32)}` as Hex, address: KEY_A },
  { label: 'B', privateKey: `0x${'22'.repeat(32)}` as Hex, address: KEY_B },
  { label: 'C', privateKey: `0x${'33'.repeat(32)}` as Hex, address: KEY_C },
];

const CONSTRUCTOR_ARGS_LENGTH = 96;

/**
 * The keccak256 of the creation bytecode committed to
 * `shared/constants/remote-control-contract.ts`.
 *
 * This is the real defence that the committed bytes are the ones the contract
 * in `rcd` actually compiles to: if the contract is recompiled with different
 * settings, or the constant is hand-edited, this changes and the suite fails
 * rather than the wallet deploying unreviewed bytecode.
 */
const EXPECTED_CREATION_CODE_HASH =
  '0x9b6b39de902f5f56f1f7795ecb7ea663232312a12951fd1a6a6fd07eafc9b647';

describe('remote-control creation bytecode', () => {
  it('matches the compiled artifact in rcd', () => {
    expect(keccak256(REMOTE_CONTROL_DELEGATE_CREATION_CODE)).toBe(
      EXPECTED_CREATION_CODE_HASH,
    );
  });

  it('is well-formed hex', () => {
    expect(REMOTE_CONTROL_DELEGATE_CREATION_CODE).toMatch(/^0x[0-9a-f]+$/u);
    expect((REMOTE_CONTROL_DELEGATE_CREATION_CODE.length - 2) % 2).toBe(0);
  });
});

describe('buildRemoteControlInitcode', () => {
  it('is well-formed hex', () => {
    const initcode = buildRemoteControlInitcode(KEYS);

    expect(initcode).toMatch(/^0x[0-9a-f]+$/u);
    expect((initcode.length - 2) % 2).toBe(0);
  });

  it('prefixes the contract creation bytecode', () => {
    const initcode = buildRemoteControlInitcode(KEYS);

    expect(initcode.startsWith(REMOTE_CONTROL_DELEGATE_CREATION_CODE)).toBe(
      true,
    );
  });

  it('appends exactly 96 bytes of constructor arguments', () => {
    const initcode = buildRemoteControlInitcode(KEYS);

    const initcodeLength = (initcode.length - 2) / 2;
    const creationCodeLength =
      (REMOTE_CONTROL_DELEGATE_CREATION_CODE.length - 2) / 2;

    expect(initcodeLength - creationCodeLength).toBe(CONSTRUCTOR_ARGS_LENGTH);
  });

  it('appends the three addresses in A, B, C order', () => {
    const initcode = buildRemoteControlInitcode(KEYS);
    const args = `0x${initcode.slice(
      REMOTE_CONTROL_DELEGATE_CREATION_CODE.length,
    )}` as Hex;

    const expected = encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
      [KEY_A, KEY_B, KEY_C],
    );

    expect(args.toLowerCase()).toBe(expected.toLowerCase());
  });
});

describe('buildRemoteControlDeployCalldata', () => {
  it('is the zero salt followed by the initcode, with no selector', () => {
    const calldata = buildRemoteControlDeployCalldata(KEYS);

    expect(calldata).toBe(
      `${REMOTE_CONTROL_CREATE2_SALT}${buildRemoteControlInitcode(KEYS).slice(2)}`,
    );
  });
});

describe('predictRemoteControlAddress', () => {
  it('is the CREATE2 address of the initcode under the canonical deployer', () => {
    expect(predictRemoteControlAddress(KEYS)).toBe(
      getCreate2Address({
        from: REMOTE_CONTROL_CREATE2_DEPLOYER,
        salt: REMOTE_CONTROL_CREATE2_SALT,
        bytecode: buildRemoteControlInitcode(KEYS),
      }),
    );
  });
});
