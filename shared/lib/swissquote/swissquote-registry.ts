import type { Hex } from '@metamask/utils';
import registryFile from './swissquote-contract-registry.txt';

const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/u;
const SHA256_REGEX = /^[0-9a-f]{64}$/u;

/** Swissquote's verdict on a piece of contract code. */
export type CodeVerdict = 'safe' | 'unsafe' | 'unknown';

/** A contract a dApp is known to run, from the registry. */
export type RegisteredContract = {
  chainId: Hex;
  address: Hex;
  label?: string;
};

export type SwissquoteRegistry = {
  /** Registered contracts, keyed by dApp domain. */
  dapps: Map<string, RegisteredContract[]>;
  /** Code hash (lowercase hex SHA-256) to verdict. */
  codeHashes: Map<string, Exclude<CodeVerdict, 'unknown'>>;
};

function toHexChainId(value: string): Hex | undefined {
  const chainId = value.toLowerCase().startsWith('0x')
    ? Number.parseInt(value, 16)
    : Number.parseInt(value, 10);
  return Number.isSafeInteger(chainId) && chainId > 0
    ? (`0x${chainId.toString(16)}` as Hex)
    : undefined;
}

/**
 * Parses the Swissquote contract registry file. See
 * `swissquote-contract-registry.txt` for the format. Malformed lines are
 * skipped.
 *
 * @param text - Raw contents of the registry file.
 * @returns The parsed registry.
 */
export function parseSwissquoteRegistry(text: string): SwissquoteRegistry {
  const dapps = new Map<string, RegisteredContract[]>();
  const codeHashes = new Map<string, Exclude<CodeVerdict, 'unknown'>>();

  for (const rawLine of text.split(/\r?\n/u)) {
    const [kind, ...fields] = rawLine.split('#')[0].trim().split(/\s+/u);
    switch (kind?.toLowerCase()) {
      case 'dapp': {
        const [domain, chainIdField, addressField, ...labelWords] = fields;
        const chainId = chainIdField ? toHexChainId(chainIdField) : undefined;
        const address = addressField?.toLowerCase();
        if (!domain || !chainId || !address || !ADDRESS_REGEX.test(address)) {
          break;
        }
        const key = domain.toLowerCase();
        const contracts = dapps.get(key) ?? [];
        contracts.push({
          chainId,
          address: address as Hex,
          label: labelWords.join(' ') || undefined,
        });
        dapps.set(key, contracts);
        break;
      }
      case 'safe':
      case 'unsafe': {
        const hash = fields[0]?.toLowerCase();
        if (hash && SHA256_REGEX.test(hash)) {
          codeHashes.set(hash, kind.toLowerCase() as 'safe' | 'unsafe');
        }
        break;
      }
      default:
        break;
    }
  }

  return { dapps, codeHashes };
}

let registry: SwissquoteRegistry | undefined;

function getRegistry(): SwissquoteRegistry {
  registry ??= parseSwissquoteRegistry(registryFile ?? '');
  return registry;
}

function getHostname(origin: string): string | undefined {
  try {
    return new URL(origin).hostname.toLowerCase() || undefined;
  } catch {
    return origin.trim().toLowerCase() || undefined;
  }
}

/**
 * Returns the contracts the registry lists for a dApp origin. A registered
 * domain also covers its subdomains (`uniswap.org` matches `app.uniswap.org`);
 * the most specific registered domain wins.
 *
 * @param origin - The dApp origin, e.g. `https://matcha.xyz`.
 * @returns The registered contracts, empty if the site is not in the registry.
 */
export function getRegisteredContractsForOrigin(
  origin?: string | null,
): RegisteredContract[] {
  const hostname = origin ? getHostname(origin) : undefined;
  if (!hostname) {
    return [];
  }
  const { dapps } = getRegistry();
  const labels = hostname.split('.');
  for (let i = 0; i < labels.length; i++) {
    const contracts = dapps.get(labels.slice(i).join('.'));
    if (contracts) {
      return contracts;
    }
  }
  return [];
}

/**
 * Looks up Swissquote's verdict for a contract code hash.
 *
 * @param codeHash - Lowercase hex SHA-256 of the contract bytecode.
 * @returns The verdict, `unknown` if the hash is not in the registry.
 */
export function getCodeHashVerdict(codeHash: string): CodeVerdict {
  return getRegistry().codeHashes.get(codeHash.toLowerCase()) ?? 'unknown';
}

/**
 * Hashes contract bytecode as the registry expects: SHA-256 over the raw
 * bytecode bytes (the hex string returned by `eth_getCode`, decoded).
 *
 * @param code - Bytecode as a hex string, with or without `0x`.
 * @returns The lowercase hex SHA-256 digest.
 */
export async function hashContractCode(code: string): Promise<string> {
  const hex = code.startsWith('0x') ? code.slice(2) : code;
  const evenHex = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(evenHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(evenHex.slice(i * 2, i * 2 + 2), 16);
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
