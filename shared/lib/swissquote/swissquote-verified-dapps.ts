import verifiedDappsList from './swissquote-verified-dapps.txt';

const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/u;

type VerifiedDapps = {
  domains: Set<string>;
  addresses: Set<string>;
};

/**
 * Parses the Swissquote verified dApps list (one domain or contract address
 * per line, `#` comments allowed) into lookup sets.
 *
 * @param list - Raw contents of the list file.
 * @returns The normalised domains and addresses.
 */
export function parseSwissquoteVerifiedDapps(list: string): VerifiedDapps {
  const domains = new Set<string>();
  const addresses = new Set<string>();

  for (const rawLine of list.split(/\r?\n/u)) {
    const entry = rawLine.split('#')[0].trim().toLowerCase();
    if (!entry) {
      continue;
    }
    if (ADDRESS_REGEX.test(entry)) {
      addresses.add(entry);
    } else {
      domains.add(entry);
    }
  }

  return { domains, addresses };
}

let verifiedDapps: VerifiedDapps | undefined;

function getVerifiedDapps(): VerifiedDapps {
  verifiedDapps ??= parseSwissquoteVerifiedDapps(verifiedDappsList ?? '');
  return verifiedDapps;
}

/**
 * Extracts the hostname from a dApp origin such as `https://app.uniswap.org`.
 * Bare hostnames are accepted as well.
 *
 * @param origin - The dApp origin or hostname.
 * @returns The lowercase hostname, or undefined if it cannot be parsed.
 */
function getHostname(origin: string): string | undefined {
  try {
    return new URL(origin).hostname.toLowerCase() || undefined;
  } catch {
    return origin.trim().toLowerCase() || undefined;
  }
}

/**
 * Whether a dApp origin is on Swissquote's verified list. A listed domain also
 * covers its subdomains (`uniswap.org` matches `app.uniswap.org`).
 *
 * @param origin - The dApp origin, e.g. `https://app.uniswap.org`.
 * @returns True if the site is verified by Swissquote.
 */
export function isOriginVerifiedBySwissquote(origin?: string | null): boolean {
  if (!origin) {
    return false;
  }
  const hostname = getHostname(origin);
  if (!hostname) {
    return false;
  }
  const { domains } = getVerifiedDapps();
  const labels = hostname.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    if (domains.has(labels.slice(i).join('.'))) {
      return true;
    }
  }
  return domains.has(hostname);
}

/**
 * Whether a contract address is on Swissquote's verified list.
 *
 * @param address - The contract address.
 * @returns True if the contract is verified by Swissquote.
 */
export function isAddressVerifiedBySwissquote(
  address?: string | null,
): boolean {
  if (!address) {
    return false;
  }
  return getVerifiedDapps().addresses.has(address.toLowerCase());
}
