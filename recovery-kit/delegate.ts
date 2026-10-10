/**
 * Delegate (or un-delegate) your EOA via EIP-7702 on one or more chains.
 *
 *   EOA_PK=0x.. DELEGATE=0xDelegateAddr RPCS="base=https://...,optimism=https://..." npm run delegate
 *   EOA_PK=0x.. REVOKE=1 RPCS="..." npm run delegate        # delegate to address(0): removes delegation
 *
 * Default: one authorization per chain, bound to that chain's id (safest).
 * CROSS_CHAIN=1: sign a single chainId=0 authorization reused everywhere. It is only valid on
 * chains where the EOA's nonce equals the signed nonce, and it is replayable by anyone on any
 * chain — so only use it for a fresh EOA with identical nonces everywhere.
 */
import { createWalletClient, http, zeroAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { connectAll, env } from './common'

const eoa = privateKeyToAccount(env('EOA_PK') as Hex)
const revoke = process.env.REVOKE === '1'
const target: Address = revoke ? zeroAddress : (env('DELEGATE') as Address)
const crossChain = process.env.CROSS_CHAIN === '1'

for (const c of await connectAll()) {
  const wallet = createWalletClient({ account: eoa, chain: c.chain, transport: http(c.url) })
  const auth = await wallet.signAuthorization({
    contractAddress: target,
    executor: 'self', // EOA sends the tx itself (nonce handling done by viem)
    ...(crossChain ? { chainId: 0 } : {}),
  })
  const hash = await wallet.sendTransaction({ authorizationList: [auth], to: eoa.address, value: 0n })
  await c.pub.waitForTransactionReceipt({ hash })
  const code = (await c.pub.getCode({ address: eoa.address })) ?? '0x'
  const ok = revoke ? code === '0x' : code.toLowerCase() === `0xef0100${target.slice(2).toLowerCase()}`
  console.log(`[${c.name}] ${revoke ? 'revoked' : 'delegated'} tx=${hash} code=${code.slice(0, 48)}… ${ok ? 'OK' : 'UNEXPECTED'}`)
}
