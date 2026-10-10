/**
 * Watches your EOA on every configured chain and alerts you the moment a remote
 * access cooldown starts (AccessRequested event, plus a state poll as a safety net
 * in case a log is missed or the watcher was down).
 *
 *   ACCOUNT=0xYourEOA RPCS="base=https://...,optimism=https://..." \
 *   WEBHOOK_URL=https://hooks.slack.com/... NTFY_URL=https://ntfy.sh/my-secret-topic \
 *   npm run watch
 *
 * Optional, OFF by default: AUTO_REVOKE=1 + WATCHER_PK=<EOA private key> makes the watcher
 * call revoke() itself. That puts your EOA key on this machine — only do it on a box you
 * trust as much as the key itself.
 */
import { createWalletClient, http, zeroAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { abi, connectAll, env } from './common'

const account = env('ACCOUNT') as Address
const POLL_MS = Number(process.env.POLL_MS ?? 10_000)
const autoRevoke = process.env.AUTO_REVOKE === '1'
const seen = new Set<string>()

async function notify(text: string) {
  console.log(`\n🚨 ${text}\n`)
  const jobs: Promise<unknown>[] = []
  if (process.env.WEBHOOK_URL)
    jobs.push(
      fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, content: text }), // Slack uses "text", Discord uses "content"
      }),
    )
  if (process.env.NTFY_URL)
    jobs.push(fetch(process.env.NTFY_URL, { method: 'POST', headers: { Priority: 'urgent', Title: 'EOA access request' }, body: text }))
  await Promise.allSettled(jobs)
}

const chains = await connectAll()
console.log(`Watching ${account} on: ${chains.map((c) => `${c.name}(${c.chain.id})`).join(', ')}`)

for (const c of chains) {
  const handle = async (controller: Address, unlock: bigint, expires: bigint, extra = '') => {
    const key = `${c.name}:${controller}:${unlock}`
    if (seen.has(key)) return
    seen.add(key)
    const secs = Number(unlock) - Math.floor(Date.now() / 1000)
    await notify(
      `Remote access requested on ${c.name} for ${account}\n` +
        `controller: ${controller}${extra}\n` +
        `execution unlocks: ${new Date(Number(unlock) * 1000).toISOString()} (${secs > 0 ? `in ${secs}s` : 'ALREADY UNLOCKED'})\n` +
        `expires: ${new Date(Number(expires) * 1000).toISOString()}\n` +
        `Cancel with cancelAccess() / revoke(), or revoke the 7702 delegation.`,
    )
    if (autoRevoke) {
      try {
        const wallet = createWalletClient({
          account: privateKeyToAccount(env('WATCHER_PK') as Hex),
          chain: c.chain,
          transport: http(c.url),
        })
        const hash = await wallet.writeContract({ address: account, abi, functionName: 'revoke' })
        await notify(`AUTO_REVOKE sent revoke() on ${c.name}: ${hash}`)
      } catch (e) {
        await notify(`AUTO_REVOKE FAILED on ${c.name}: ${(e as Error).message}`)
      }
    }
  }

  // 1) instant: event subscription (polling transport under the hood)
  c.pub.watchContractEvent({
    address: account,
    abi,
    eventName: 'AccessRequested',
    args: { account },
    pollingInterval: 3_000,
    onLogs: (logs) =>
      logs.forEach((l) =>
        handle(l.args.controller!, l.args.unlockTime!, l.args.expiresAt!, `\nsigners: ${l.args.signerA}, ${l.args.signerB}`),
      ),
    onError: (e) => console.error(`[${c.name}] watch error:`, e.message),
  })

  // 2) safety net: state poll (also catches sessions opened while the watcher was down)
  const poll = async () => {
    try {
      const [controller, unlock, expires] = await c.pub.readContract({ address: account, abi, functionName: 'accessState' })
      if (controller !== zeroAddress && Number(expires) > Date.now() / 1000) await handle(controller, unlock, expires)
    } catch {
      /* account not delegated on this chain, or RPC hiccup */
    }
  }
  await poll()
  setInterval(poll, POLL_MS)
}
