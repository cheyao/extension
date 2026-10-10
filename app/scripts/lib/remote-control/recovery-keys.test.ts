import { generateRemoteControlKeys } from './recovery-keys';

describe('generateRemoteControlKeys', () => {
  it('returns three keys labelled A, B and C', () => {
    const keys = generateRemoteControlKeys();

    expect(keys).toHaveLength(3);
    expect(keys.map((key) => key.label)).toStrictEqual(['A', 'B', 'C']);
  });

  it('returns distinct addresses', () => {
    const keys = generateRemoteControlKeys();

    const addresses = new Set(keys.map((key) => key.address.toLowerCase()));
    expect(addresses.size).toBe(3);
  });

  it('returns a well-formed private key for each address', () => {
    const keys = generateRemoteControlKeys();

    keys.forEach((key) => {
      expect(key.privateKey).toMatch(/^0x[0-9a-f]{64}$/u);
      expect(key.address).toMatch(/^0x[0-9a-fA-F]{40}$/u);
    });
  });

  it('returns a different set on each call', () => {
    const first = generateRemoteControlKeys().map((key) => key.privateKey);
    const second = generateRemoteControlKeys().map((key) => key.privateKey);

    expect(first).not.toStrictEqual(second);
  });
});
