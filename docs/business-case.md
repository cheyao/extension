# Business case: Swissquote Wallet

## 1. Summary

Swissquote already lets clients buy and hold crypto inside the bank. What it
does not offer is a way for clients to **use** crypto on-chain: decentralised
apps (dApps), DeFi, stablecoin payments and self-custody. Today clients who
want that withdraw to a third-party wallet (MetaMask, Ledger, Coinbase Wallet)
and leave the Swissquote relationship.

Swissquote Wallet keeps those clients and their activity in a Swissquote-branded
product, and adds what generic wallets lack and a bank is trusted for:

| Problem with generic wallets | Swissquote Wallet answer |
| --- | --- |
| Users need native tokens just to pay gas | **Gasless transactions** sponsored by Swissquote |
| Users cannot tell safe dApps from scams | **Swissquote-reviewed contract code** (SHA-256 of live bytecode) |
| A lost seed phrase means lost funds | **2-of-3 key recovery** with a cooldown the owner can cancel |
| No link to a regulated institution | **Swissquote brand, deposit currency (sUSD) and card** |

All of this while staying **self-custodial**: Swissquote never holds the keys.

---

## 2. Why now

- **Clients are leaving to go on-chain.** Every withdrawal to an external wallet
  is assets and trading activity Swissquote no longer sees.
- **Stablecoins and tokenisation are becoming mainstream.** Banks that have a
  wallet in clients' hands will be the natural distribution channel for
  tokenised assets and payments.
- **The technology has matured.** EIP-7702 and ERC-4337 (account abstraction)
  make gasless and recoverable wallets possible on ordinary accounts, without
  new addresses or migrations. This prototype already uses them on Monad
  mainnet.
- **Competitors are moving.** Exchanges (Coinbase, Kraken, Binance) all ship
  their own self-custodial wallets as a funnel into their platforms.

---

## 3. Value for Swissquote

### 3.1 Retention and share of wallet

The wallet is a place to *keep* clients who would otherwise move funds to
MetaMask. Deposits into sUSD, card top-ups and swaps keep activity inside the
Swissquote ecosystem.

### 3.2 New revenue

| Stream | How |
| --- | --- |
| Swap and bridge fees | A fee on in-wallet swaps (MetaMask's own model) |
| sUSD / stablecoin float | Yield on the reserves behind a Swissquote-issued deposit token (only if Swissquote issues its own) |
| Card | Interchange on card spending funded from the wallet |
| Perps and trading | Fees or referral share on derivatives routed through the wallet (subject to regulation) |
| Premium security | Recovery and contract checks as part of a paid account tier |

Gas sponsorship is a cost, not revenue. It works as a customer acquisition
cost: a gasless first transaction removes the biggest onboarding hurdle, and
sponsorship can be limited to Swissquote clients, specific networks or
specific actions.

### 3.3 Trust as the differentiator

Generic wallets compete on features. Swissquote can compete on **trust**:
a Swiss, regulated bank reviewing the code users interact with and offering a
recovery path. That is hard for a crypto-native company to copy credibly.

### 3.4 Strategic positioning

A wallet in clients' browsers is the distribution channel for future products:
tokenised securities, on-chain funds, stablecoin payments, and identity
(attestations that a user is a verified Swissquote client).

---

## 4. Features and why each matters

### Gasless transactions (main feature)
- Removes the "you need ETH/MON to send USDC" problem that blocks new users.
- Swissquote controls who is sponsored, on which networks and up to what cost
  (paymaster policies).
- Real today on Monad mainnet (Pimlico) and Sepolia (Candide).

### Swissquote contract check
- Swissquote reviews the **code**, not just addresses: if a contract's code
  changes, the verdict no longer applies.
- Runs on top of MetaMask's existing protections (phishing list, Blockaid).
- Turns Swissquote's compliance and risk expertise into a user-facing feature.
- Today a demo list (major dApps green, Uniswap red for demonstration).

### Wallet recovery
- The main fear of self-custody is losing the seed phrase. 2-of-3 keys with a
  5-minute cooldown and owner alerts solve that without Swissquote holding
  the funds.
- Real on Monad mainnet; not audited.

### sUSD deposit currency and card
- A single Swissquote-branded dollar balance and a card to spend it make the
  wallet feel like a bank product, not a developer tool.
- Today sUSD is MetaMask's mUSD rebranded and the card is a demo (see risks).

---

## 5. What a launch would require

| Area | Requirement |
| --- | --- |
| **Code licence** | A commercial licence from ConsenSys (the MetaMask licence allows non-commercial use only, e.g. under 10,000 monthly users), or a rebuild on MIT-licensed components |
| **Backend services** | Agreements for, or replacements of, MetaMask APIs (prices, swaps, token lists), Infura, Blockaid and the paymaster/bundler (Pimlico) |
| **sUSD** | Either a Swissquote-issued token (regulatory process) or honest labelling of the underlying stablecoin |
| **Regulation** | FINMA review of recovery-key custody, perps for retail clients, AML and travel-rule obligations |
| **Security** | Audits of the recovery contract and wallet changes; keep paymaster API keys off the client (server-side proxy) |
| **Contract registry** | A real review process, server-side registry and clear liability wording |
| **Card** | A card-issuing partner and integration (the current tab is a demo) |

