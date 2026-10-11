# Swissquote Wallet

A self-custodial crypto wallet browser extension designed as a companion to a
Swissquote account. It is a fork of the [MetaMask extension](https://github.com/MetaMask/metamask-extension),
rebranded and extended with gasless transactions, a second layer of dApp
security, an on-chain wallet recovery system, a Swissquote deposit currency
(sUSD), a payment card, and a custom account recovery solution.

- **Business case:** [docs/business-case.md](./docs/business-case.md)
- **Code architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Build, test and tooling guide:** [docs/development-guide.md](./docs/development-guide.md)
- **Instructions for AI coding agents:** [AGENTS.md](./AGENTS.md)

---

## Core new features

- Verified and Malicious DeFi popups by SwissQuote
- Integrated Prepaid Credit Card Top-up and Usage
- Smart 2-out-of-3 Funds Recovery in Case of Lost of Private Key
- Multi-chain support - EVM and Bitcoin
- Gasless transactions via Pimlico
- Transaction simulation to find malicious countracts
- Full dApp support

## Special Swissquote services

- Perps trading
- Prepaid credit card
- Swap
- On-ramp
- sUSD liquid staking

*Swissquote shall be charging a small fee when these features are used*

---

## Contents

1. [Core principles](#core-principles)
2. [Features](#features)
3. [What is real and what is simulated](#what-is-real-and-what-is-simulated)
4. [Getting started](#getting-started)
5. [Configuration](#configuration)
6. [Repository map](#repository-map)
7. [Known limitations](#known-limitations)

---

## Core principles

- **Self-custody first.** Keys are generated and kept in the user's browser
  vault. Swissquote never holds keys and never gets unrestricted access to
  funds. Every sponsored or delegated feature is capped, revocable, or both.
- **The user pays gas by default.** Gasless is always an explicit choice.
- **Security is layered.** MetaMask's protections (phishing list, Blockaid
  transaction simulation, malicious-site warnings) stay in place; Swissquote
  checks run on top.
- **Swissquote look.** Mostly black, with the Swissquote orange used sparingly.

---

## Features

### 1. Swissquote branding and theme

- Swissquote logo, toolbar icons, wordmark, onboarding intro and
  "wallet ready" animations.
- Theme: orange accent (`#ef6c1a`) on neutral black/white surfaces, darker
  gain/loss colours (`#4fa20e` / `#e62219`) and orange accents on the header,
  home tabs and bottom navigation.
- Onboarding: Swissquote welcome screen, compact orange language picker (EN,
  DE, FR…), Swissquote Terms of Use.
- MetaMask promotional features removed (mUSD ads, Earn/staking button,
  "Explore DeFi" link, analytics opt-in step).

Code: `ui/css/swissquote-theme.scss`, `ui/components/ui/metafox-logo/`,
`ui/pages/onboarding-flow/welcome/`, `app/images/logo/`.

### 2. Gasless transactions (main feature)

Every transaction confirmation has a **Gas** selector: **Pay gas fee**
(default) or **Gasless**.

- **Gasless** sends the transaction as an ERC-4337 *user operation* from the
  user's own account. On first use the account is upgraded with EIP-7702 to
  the standard `Simple7702Account` contract (EntryPoint v0.8). A paymaster pays
  the gas, so the account needs no native token.
- Gas stations (sponsors) are configured per network:
  - **Monad mainnet:** the team's Pimlico gas station (bundler + paymaster),
    URL with API key from `.metamaskrc`.
  - **Sepolia (testnet):** Candide's free public paymaster.
  - Networks without a gas station show Gasless as "Unavailable".
- MetaMask's own "Paid by MetaMask" relay is disabled: it rejects Swissquote
  transactions.
- **Monad 10 MON reserve rule:** on Monad a sponsored (7702) account must keep
  at least 10 MON after spending MON, so Gasless is greyed out for
  transactions that would go below it.
- Failed transactions show a **Reason** box with the exact error.

Code: `shared/constants/swissquote.ts`,
`app/scripts/lib/transaction/swissquote-gasless.ts`,
`app/scripts/lib/transaction/erc4337-user-operation.ts`,
`ui/pages/confirmations/components/confirm/info/shared/gas-payment-selector/`.

### 3. dApp and DeFi security: Swissquote contract check

A second check on top of MetaMask's security:

- When a site asks to connect, the wallet looks up the contracts that dApp
  uses, downloads their **live bytecode**, hashes it with **SHA-256**, and
  compares the hash with Swissquote's list of `safe` / `unsafe` code.
- A popup shows **Verified safe**, **Flagged as unsafe** or **Not recognised**,
  per contract. If the code at an address changes, the hash changes and the
  verdict no longer applies.
- The database is currently a demo file:
  `shared/lib/swissquote/swissquote-contract-registry.txt`.

Code: `shared/lib/swissquote/swissquote-registry.ts`,
`ui/hooks/swissquote/useSwissquoteContractChecks.ts`,
`ui/components/app/swissquote-verification/`,
`ui/pages/permissions-connect/connection-trust-signal-gate/`.

### 4. Wallet recovery (3-key remote control)

An on-chain recovery system for lost access, built on EIP-7702:

- When a **new wallet** is created, it is delegated (gaslessly, via the Pimlico
  gas station) to a `RemoteControlDelegate` contract, and the user receives
  **three recovery keys**.
- **Any two of the three keys** can grant a *controller* address access to the
  wallet. Access only starts after a **5-minute cooldown**, during which the
  owner is alerted in the extension and can cancel or revoke. Access then lasts
  one hour.
- Recovery runs from the **Swissquote recovery** option on the welcome screen
  (fully in the browser), or from the command-line `recovery-kit/`.
- The background watches for access requests and shows an alert with a
  countdown.

Code: `contract/RemoteControlDelegate.sol`,
`app/scripts/controllers/remote-control/`, `app/scripts/lib/remote-control/`,
`shared/lib/remote-control/recover-wallet.ts`,
`ui/pages/onboarding-flow/recovery-keys/`,
`ui/pages/onboarding-flow/swissquote-recovery/`,
`ui/components/app/remote-control-access-alert/`, `recovery-kit/`.

### 5. sUSD: the Swissquote deposit currency

- **sUSD** ("Swissquote USD") is the user-facing name of the deposit currency.
  Under the hood it is MetaMask's **mUSD** stablecoin (same address, balances,
  trading and conversion). mUSD is never shown by name.
- Branding is applied at three levels: the app's mUSD constants, the token list
  and asset page, and a network layer that rebrands MetaMask API replies.
- sUSD appears once in the token list, with balances from every network
  combined. MetaMask's stablecoin → mUSD conversion flow serves as the sUSD
  deposit flow.
- A separate demo sUSD wrapper contract exists on Monad testnet.

Code: `ui/components/app/musd/constants.ts`,
`shared/lib/swissquote/susd-branding.ts`, `shared/constants/susd.ts`,
`ui/hooks/susd/`.

### 6. Swissquote Card (demo)

A **Card** tab on the home screen with a mock Swissquote payment card (number,
expiry, CVC with show/hide), a mock **Top up** dialog and a transactions list.

Code: `ui/components/app/card-tab/`.

### 7. Other changes

- Test networks and their tokens appear under "All networks" when
  "Show test networks" is on; the setting survives a wallet restore.
- Perps (MetaMask's Hyperliquid perpetuals) is available.
- MetaMask's Money account features are disabled.

---

## What is real and what is simulated

| Area | Status |
| --- | --- |
| Self-custodial wallet, signing, sending, swaps, buy/sell | **Real** (MetaMask core and services) |
| Pay-gas transactions | **Real** |
| Gasless on Monad mainnet (Pimlico) | **Real**: the team's Pimlico balance pays the gas |
| Gasless on Sepolia (Candide) | **Real**, testnet |
| Monad 10 MON reserve guard | **Real** (protocol rule) |
| Contract code hashing (SHA-256 of live bytecode) | **Real** |
| Swissquote safe/unsafe database | **Demo**: local `.txt`, illustrative verdicts |
| Recovery delegate, 2-of-3 keys, cooldown, alerts | **Real** on Monad mainnet (not audited) |
| sUSD token | **Real** mUSD underneath; "sUSD" is branding only |
| sUSD wrapper on Monad testnet | **Demo** contract, unaudited |
| Swissquote Card and top-up | **Demo**, nothing is charged or sent |
| Terms of Use | **Placeholder**: ConsenSys text with names replaced |
| Swissquote logo | Original design, not Swissquote's official mark |
| Connection to real Swissquote accounts or systems | **None** |

---

## Getting started

Requirements: Node.js 24 (`nvm use`), Corepack (`corepack enable`).

```bash
yarn install
cp .metamaskrc.dist .metamaskrc   # then fill in the values below
yarn start                        # development build into dist/chrome
```

Load `dist/chrome` as an unpacked extension in Chrome (`chrome://extensions`,
Developer mode, **Load unpacked**). After code changes the dev build recompiles
automatically; reload the extension to pick them up. Changes to `.metamaskrc`
or webpack config need a restart of `yarn start`.

If the dev build crashes with "JavaScript heap out of memory" after running for
a long time, restart it with more memory:

```bash
NODE_OPTIONS=--max-old-space-size=8192 yarn start
```

Full build, test and tooling instructions:
[docs/development-guide.md](./docs/development-guide.md).

---

## Configuration

`.metamaskrc` (local only, gitignored, never commit it):

| Variable | Purpose |
| --- | --- |
| `INFURA_PROJECT_ID` | RPC access for Ethereum and other Infura networks (required) |
| `REMOTE_CONTROL_GAS_STATION_RPC_URL` | Pimlico bundler + paymaster URL **with API key**. Enables gasless on Monad and the recovery delegate deployment |
| `PERPS_ENABLED` | Includes Perps in the build |
| `SEEDLESS_ONBOARDING_ENABLED` | Social login onboarding (off by default) |

Code-level configuration:

| File | What it sets |
| --- | --- |
| `shared/constants/swissquote.ts` | Gas stations per network |
| `shared/constants/remote-control.ts` | Recovery chain, Pimlico paymaster, timeouts |
| `shared/lib/swissquote/swissquote-contract-registry.txt` | Safe / unsafe code hashes and dApp → contract map |
| `shared/constants/susd.ts` | sUSD wrapper contract on Monad testnet |
| `ui/css/swissquote-theme.scss` | Theme colours |

---

## Repository map

```
app/            Extension shell: background service worker, controllers,
                manifests, images, translations (_locales)
ui/             React + Redux user interface
shared/         Code used by both background and UI (constants, libraries)
contract/       RemoteControlDelegate.sol (recovery contract)
recovery-kit/   Command-line tools for the recovery system
development/    Build system (webpack) and dev tools
lavamoat/       LavaMoat security policies for dependencies
test/           End-to-end, integration tests and mocks
docs/           Developer documentation
```

Details: [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Known limitations

- **API key in the client:** the Pimlico key is compiled into the extension;
  anyone with a copy can extract it. Use a spending-capped key.
- **Disabled, not removed:** MetaMask features that are switched off (Money
  account, mUSD ads, Earn…) still exist in the code.
- **Tests:** some unit tests still expect MetaMask behaviour and will fail.
- **sUSD on-chain:** block explorers show the underlying token as mUSD.
- **Production builds** need `yarn lavamoat:auto` after dependency changes; only
  development builds have been used.
- **Shown to dApps as MetaMask:** the wallet announces itself to dApps with
  MetaMask's name and ID (EIP-6963), with the Swissquote icon. It speaks the
  same wallet protocol, so every MetaMask-compatible dApp works. A custom name
  made wallet libraries such as Privy (used by Matcha) show the MetaMask fox.
- **Not audited:** no security review of contracts or wallet changes.

