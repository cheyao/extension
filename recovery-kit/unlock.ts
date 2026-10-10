/**
 * Unlock a wallet for a controller, using 2 of its 3 recovery keys.
 *
 *  npm run unlock -- <KEY_PK_1> <KEY_PK_2> <CONTROLLER> <CONTROLLER_PK> <DESTINATION>
 *
 *  KEY_PK_1, KEY_PK_2  two of the three recovery private keys (any two, distinct)
 *  CONTROLLER          address that will be allowed to act from DESTINATION
 *  CONTROLLER_PK       private key that submits (and pays gas for) the request;
 *                      normally CONTROLLER's own key, which is also what you need
 *                      to execute once unlocked
 *  DESTINATION         the wallet (EOA) to unlock; it must be EIP-7702 delegated
 *                      to a RemoteControlDelegate
 *
 * Env: RPC_URL (default https://rpc.monad.xyz), NO_WAIT=1 to exit right after the
 * request instead of waiting out the 5-minute cooldown.
 *
 * The destination's owner is alerted (AccessRequested) and can cancel or revoke
 * during the cooldown. Once unlocked, the controller can execute for 1 hour:
 *  ACCOUNT=<DESTINATION> CONTROLLER_PK=.. TO=.. VALUE_WEI=.. DATA=0x RPCS="monad=<rpc>" npm run controller execute
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  http,
  isAddress,
  isHex,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { abi } from './common'

const REVERT_REASONS: Record<string, string> = {
  NotAKey: 'one of the two keys is not a recovery key of this wallet',
  NotEnoughDistinctKeys: 'both signatures come from the same key',
  SignatureExpired: 'the signature deadline has passed',
}

function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

function parsePrivateKey(name: string, value: string | undefined): Hex {
  const pk = value?.startsWith('0x') ? value : `0x${value ?? ''}`
  if (!isHex(pk) || pk.length !== 66) fail(`${name} is not a 32-byte private key`)
  return pk
}

function parseAddress(name: string, value: string | undefined): Address {
  if (!value || !isAddress(value, { strict: false })) fail(`${name} is not an address`)
  return getAddress(value)
}

const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString()

const args = process.argv.slice(2)
if (args.length !== 5) {
  console.error(
    'usage: npm run unlock -- <KEY_PK_1> <KEY_PK_2> <CONTROLLER> <CONTROLLER_PK> <DESTINATION>',
  )
  process.exit(1)
}

const key1 = privateKeyToAccount(parsePrivateKey('KEY_PK_1', args[0]))
const key2 = privateKeyToAccount(parsePrivateKey('KEY_PK_2', args[1]))
const controller = parseAddress('CONTROLLER', args[2])
const submitter = privateKeyToAccount(parsePrivateKey('CONTROLLER_PK', args[3]))
const destination = parseAddress('DESTINATION', args[4])

if (key1.address === key2.address) fail('KEY_PK_1 and KEY_PK_2 are the same key')
if (submitter.address !== controller) {
  console.warn(
    `warning: CONTROLLER_PK is for ${submitter.address}, not CONTROLLER ${controller}.\n` +
      '         It will only pay for the request; executing later needs CONTROLLER\'s key.',
  )
}

const rpcUrl = process.env.RPC_URL ?? 'https://rpc.monad.xyz'
const chainId = await createPublicClient({ transport: http(rpcUrl) }).getChainId()
const chain = defineChain({
  id: chainId,
  name: `chain ${chainId}`,
  nativeCurrency: { name: 'Native', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
})
const pub = createPublicClient({ chain, transport: http(rpcUrl) })
const wallet = createWalletClient({ account: submitter, chain, transport: http(rpcUrl) })

// 1. The destination must be delegated (EIP-7702) to a RemoteControlDelegate;
//    the delegate's logic only runs as the destination's own code.
const code = (await pub.getCode({ address: destination }))?.toLowerCase() ?? '0x'
if (code === '0x') {
  fail(`${destination} has no EIP-7702 delegation on chain ${chainId}, so it has no recovery to unlock`)
}
if (!code.startsWith('0xef0100') || code.length !== 48) {
  fail(`${destination} is a contract, not a 7702-delegated EOA`)
}
const delegate = getAddress(`0x${code.slice(8)}`)
console.log(`destination ${destination} is delegated to ${delegate}`)

let state
try {
  state = await pub.readContract({ address: destination, abi, functionName: 'accessState' })
} catch {
  fail(
    `${destination} is delegated to ${delegate}, which is not a RemoteControlDelegate ` +
      '(accessState() failed). Re-delegate the wallet to its recovery contract first.',
  )
}
const [currentController, currentUnlock, currentExpiry, nonce] = state

// 2. Already unlocked (or unlocking) for this controller? Nothing to do.
const { timestamp: now } = await pub.getBlock()
if (currentController === controller && now < currentExpiry) {
  console.log(
    now >= currentUnlock
      ? `already unlocked for ${controller} until ${iso(currentExpiry)}`
      : `already requested for ${controller}; unlocks ${iso(currentUnlock)}`,
  )
  process.exit(0)
}

// 3. Both keys sign the access request (EIP-712, bound to this chain and wallet).
const deadline = now + 3600n
const typedData = {
  domain: { name: 'RemoteControlDelegate', version: '1', chainId, verifyingContract: destination },
  types: {
    AccessRequest: [
      { name: 'controller', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'AccessRequest',
  message: { controller, nonce, deadline },
} as const
const [sigA, sigB] = await Promise.all([key1.signTypedData(typedData), key2.signTypedData(typedData)])
for (const [sig, key] of [[sigA, key1], [sigB, key2]] as const) {
  if ((await recoverTypedDataAddress({ ...typedData, signature: sig })) !== key.address) {
    fail('signature self-check failed')
  }
}

// 4. Simulate first, so a wrong key fails here with a readable reason, for free.
let request
try {
  ;({ request } = await pub.simulateContract({
    account: submitter,
    address: destination,
    abi,
    functionName: 'requestAccess',
    args: [controller, deadline, sigA, sigB],
  }))
} catch (error) {
  const revert =
    error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null
  const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined
  fail(
    name
      ? `the contract rejected the request: ${REVERT_REASONS[name] ?? name}`
      : `simulation failed: ${error instanceof BaseError ? error.shortMessage : String(error)}`,
  )
}

// 5. The submitter pays gas.
const [gas, gasPrice, balance] = await Promise.all([
  pub.estimateContractGas(request),
  pub.getGasPrice(),
  pub.getBalance({ address: submitter.address }),
])
const cost = gas * gasPrice
if (balance < cost) {
  fail(
    `${submitter.address} has ${formatEther(balance)} MON but the request needs about ` +
      `${formatEther(cost)} MON in gas`,
  )
}

const hash = await wallet.writeContract(request)
console.log(`requestAccess sent: ${hash}`)
const receipt = await pub.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success') fail(`requestAccess reverted in ${hash}`)

const [, unlockTime, expiresAt] = await pub.readContract({
  address: destination,
  abi,
  functionName: 'accessState',
})
console.log(
  `access requested for ${controller}\n` +
    `  unlocks ${iso(unlockTime)}\n  expires ${iso(expiresAt)}\n` +
    '  the wallet owner can cancel or revoke until it unlocks',
)

if (process.env.NO_WAIT) process.exit(0)

// 6. Wait out the cooldown, by chain time, and confirm nobody cancelled it.
for (;;) {
  const { timestamp } = await pub.getBlock()
  const [current, unlock] = await pub.readContract({ address: destination, abi, functionName: 'accessState' })
  if (current !== controller || unlock !== unlockTime) {
    fail('the request was cancelled or revoked by the wallet owner during the cooldown')
  }
  if (timestamp >= unlockTime) break
  process.stdout.write(`\r  cooldown: ${unlockTime - timestamp}s left   `)
  await new Promise((resolve) => setTimeout(resolve, 5000))
}
console.log(`\nunlocked: ${controller} can execute from ${destination} until ${iso(expiresAt)}`)
