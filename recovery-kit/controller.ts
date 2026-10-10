/**
 * Remote-controller helper.
 *
 *  # 1) two key-holders sign, anyone submits; this starts the 5-min cooldown (and alerts the EOA)
 *  ACCOUNT=0x.. CONTROLLER=0x.. KEY_PK_1=0x.. KEY_PK_2=0x.. SUBMITTER_PK=0x.. RPCS="base=..." npm run controller request
 *
 *  # 2) after the cooldown, the controller executes a call from the EOA
 *  ACCOUNT=0x.. CONTROLLER_PK=0x.. TO=0x.. VALUE_WEI=0 DATA=0x RPCS="base=..." npm run controller execute
 */
import { createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { abi, connectAll, env } from './common'

const cmd = process.argv[2]
const account = env('ACCOUNT') as Address
const [c] = await connectAll()

if (cmd === 'request') {
  const controller = env('CONTROLLER') as Address
  const [, , , nonce] = await c.pub.readContract({ address: account, abi, functionName: 'accessState' })
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const domain = { name: 'RemoteControlDelegate', version: '1', chainId: c.chain.id, verifyingContract: account } as const
  const types = { AccessRequest: [{ name: 'controller', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] } as const
  const message = { controller, nonce, deadline }
  const sign = (pk: string) => privateKeyToAccount(pk as Hex).signTypedData({ domain, types, primaryType: 'AccessRequest', message })
  const [sigA, sigB] = await Promise.all([sign(env('KEY_PK_1')), sign(env('KEY_PK_2'))])

  const wallet = createWalletClient({ account: privateKeyToAccount(env('SUBMITTER_PK') as Hex), chain: c.chain, transport: http(c.url) })
  const hash = await wallet.writeContract({ address: account, abi, functionName: 'requestAccess', args: [controller, deadline, sigA, sigB] })
  await c.pub.waitForTransactionReceipt({ hash })
  const [, unlock, expires] = await c.pub.readContract({ address: account, abi, functionName: 'accessState' })
  console.log(`requested: ${hash}\nunlocks ${new Date(Number(unlock) * 1000).toISOString()}, expires ${new Date(Number(expires) * 1000).toISOString()}`)
} else if (cmd === 'execute') {
  const wallet = createWalletClient({ account: privateKeyToAccount(env('CONTROLLER_PK') as Hex), chain: c.chain, transport: http(c.url) })
  const call = { target: env('TO') as Address, value: BigInt(process.env.VALUE_WEI ?? '0'), data: (process.env.DATA ?? '0x') as Hex }
  const hash = await wallet.writeContract({ address: account, abi, functionName: 'execute', args: [[call]] })
  console.log('executed:', hash)
} else {
  console.error('usage: controller.ts <request|execute>')
  process.exit(1)
}
