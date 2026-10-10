import { createPublicClient, defineChain, http, parseAbi, type Chain } from 'viem'

export const abi = parseAbi([
  'function requestAccess(address controller, uint256 deadline, bytes sigA, bytes sigB)',
  'function execute((address target, uint256 value, bytes data)[] calls) payable',
  'function cancelAccess()',
  'function revoke()',
  'function accessState() view returns (address controller, uint64 unlockTime, uint64 expiresAt, uint256 nonce)',
  'event AccessRequested(address indexed account, address indexed controller, address signerA, address signerB, uint256 unlockTime, uint256 expiresAt)',
  'event AccessCancelled(address indexed account)',
  'event Revoked(address indexed account, uint256 newNonce)',
  'error NotAuthorized()',
  'error InvalidKeys()',
  'error SignatureExpired()',
  'error NotEnoughDistinctKeys()',
  'error NotAKey()',
  'error CallFailed(uint256 index, bytes returndata)',
])

export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var ${name}`)
  return v
}

/** RPCS="base=https://mainnet.base.org,optimism=https://mainnet.optimism.io" */
export async function connectAll(spec = env('RPCS')) {
  const out: { name: string; url: string; chain: Chain; pub: ReturnType<typeof createPublicClient> }[] = []
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf('=')
    const name = part.slice(0, i)
    const url = part.slice(i + 1)
    const id = await createPublicClient({ transport: http(url) }).getChainId()
    const chain = defineChain({
      id,
      name,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [url] } },
    })
    out.push({ name, url, chain, pub: createPublicClient({ chain, transport: http(url) }) })
  }
  return out
}
