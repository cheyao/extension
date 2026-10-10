/**
 * Swissquote Wallet: sUSD branding for MetaMask's mUSD.
 *
 * sUSD is the user-facing name of the deposit currency; under the hood it is
 * MetaMask's mUSD token. "mUSD" and "MetaMask USD" must never reach the UI, but
 * token names come from many MetaMask APIs (token lists, swaps/bridge, buy &
 * sell catalogs, prices). Instead of patching every screen, the JSON replies of
 * those APIs are rebranded before anything reads them.
 *
 * Only exact JSON string values are replaced ("mUSD", "MUSD", "MetaMask USD"),
 * so addresses, amounts and asset IDs are untouched and requests keep working.
 */

export const SUSD_BRAND_SYMBOL = 'sUSD';
export const SUSD_BRAND_NAME = 'Swissquote USD';

/**
 * Rebrands mUSD in a JSON text: exact string values "mUSD" / "MUSD" become
 * "sUSD" and "MetaMask USD" becomes "Swissquote USD".
 *
 * @param text - JSON text.
 * @returns The rebranded text.
 */
export function rebrandMusdJson(text: string): string {
  if (!/mUSD|MUSD|MetaMask USD/u.test(text)) {
    return text;
  }
  return text
    .replace(/"MetaMask USD"/gu, `"${SUSD_BRAND_NAME}"`)
    .replace(/"(?:mUSD|MUSD)"/gu, `"${SUSD_BRAND_SYMBOL}"`);
}

/**
 * Rebrands mUSD in a plain display string (e.g. a token name or symbol read
 * from state stored before this branding existed). "USD" alone is untouched.
 *
 * @param value - Display text.
 * @returns The rebranded text.
 */
export function rebrandMusdText<Value extends string | undefined | null>(
  value: Value,
): Value {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replace(/MetaMask USD/gu, SUSD_BRAND_NAME)
    .replace(
      /(?<![A-Za-z])(?:mUSD|MUSD)(?![A-Za-z])/gu,
      SUSD_BRAND_SYMBOL,
    ) as Value;
}

function isMetaMaskApi(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'metamask.io' || hostname.endsWith('.metamask.io');
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Wraps `fetch` in the current context (UI page or background service
 * worker) so JSON replies from MetaMask APIs are rebranded. Safe to call more
 * than once.
 *
 * @param scope - The global object whose `fetch` to wrap.
 */
export function installSusdBranding(
  scope: { fetch?: typeof fetch } = globalThis,
): void {
  if (installed || typeof scope.fetch !== 'function') {
    return;
  }
  installed = true;
  const originalFetch = scope.fetch.bind(scope);

  scope.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input && typeof (input as Request).url === 'string') {
      url = (input as Request).url;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!isMetaMaskApi(url) || !contentType.includes('json')) {
      return response;
    }
    try {
      const text = await response.clone().text();
      const rebranded = rebrandMusdJson(text);
      if (rebranded === text) {
        return response;
      }
      const branded = new Response(rebranded, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      // Keep `response.url` (read by some callers) pointing at the original.
      Object.defineProperty(branded, 'url', { value: response.url });
      return branded;
    } catch {
      return response;
    }
  };
}
