# Development guide

Build, test and tooling instructions for Swissquote Wallet. These are inherited
from MetaMask (the codebase this project forks) and apply unchanged. For what
the project is and how it is structured, see the [README](../README.md) and
[ARCHITECTURE.md](../ARCHITECTURE.md).

## Building on your local machine

- Install [Node.js](https://nodejs.org) version 24
  - If you are using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) (recommended) running `nvm use` will automatically choose the right node version for you.
- Enable Corepack by executing the command `corepack enable` within the metamask-extension project. Corepack is a utility included with Node.js by default. It manages Yarn on a per-project basis, using the version specified by the `packageManager` property in the project's package.json file. Please note that modern releases of [Yarn](https://yarnpkg.com/getting-started/install) are not intended to be installed globally or via npm.
- Duplicate `.metamaskrc.dist` within the root and rename it to `.metamaskrc` by running `cp .metamaskrc{.dist,}`.
  - Replace the `INFURA_PROJECT_ID` value with your own personal [Infura API Key](https://docs.infura.io/networks/ethereum/how-to/secure-a-project/project-id).
    - If you don't have an Infura account, you can create one for free on the [Infura website](https://app.infura.io/register).
- Run `yarn install` to install the dependencies.
- Build the project to the `./dist/` folder with `yarn dist` (for Chromium-based browsers) or `yarn dist:mv2` (for Firefox)
  - Optionally, to create a development build you can instead run `yarn start` (for Chromium-based browsers) or `yarn start:mv2` (for Firefox)
  - Uncompressed builds can be found in `/dist`, compressed builds can be found in `/builds` once they're built.
  - See the [build system readme](./development/build/README.md) for build system usage information.

- Follow these instructions to verify that your local build runs correctly:
  - [How to add custom build to Chrome](./docs/add-to-chrome.md)
  - [How to add custom build to Firefox](./docs/add-to-firefox.md)

## AI Agent Skills (`yarn skills`)

AI coding agents (Cursor, Claude Code, Codex) consume shared skills from the [MetaMask/skills](https://github.com/MetaMask/skills) repo, with an optional private overlay from [Consensys/skills](https://github.com/Consensys/skills). Per [ADR #57](https://github.com/MetaMask/decisions/pull/162) this content is **not committed here** — `yarn skills` syncs it on demand into local-only paths under `.cursor/`, `.claude/`, and `.agents/`.

Zero-config setup:

```bash
yarn install # refreshes the MetaMask/skills cache via the shared `@metamask/skills` CLI
yarn skills  # syncs all default skills through the `metamask-skills sync` command
```

Optional local configuration:

```bash
cp .skills.local.example .skills.local
# edit .skills.local to set SKILLS_DOMAINS or override skills source paths
yarn skills --select                         # interactively pick domains
SKILLS_DOMAINS=perps,testing yarn skills      # one-off domain override
```

Use `.skills.local` for persistent skills configuration. Shell environment variables with the same names are supported for one-off or CI overrides and take precedence.

Skipping `yarn skills` is fine — it only affects agent tooling, not the app build. The repo uses the shared `@metamask/skills` package so sync/cache behavior stays uniform across MetaMask packages. To opt into best-effort regeneration during install/setup, set `SKILLS_AUTO_UPDATE=1` in your shell or `.skills.local`.

## Git Hooks

To get quick feedback from our shared code quality fitness functions before committing the code, you can install our git hooks with Husky.

`$ yarn githooks:install`

You can read more about them in our [testing documentation](./docs/testing.md#fitness-functions-measuring-progress-in-code-quality-and-preventing-regressions-using-custom-git-hooks).

If you are using VS Code and are unable to make commits from the source control sidebar due to a "command not found" error, try these steps from the [Husky docs](https://typicode.github.io/husky/troubleshooting.html#command-not-found).

## Contributing

### Development builds

To start a development build (e.g. with logging and file watching) run `yarn start`.

#### Development build with wallet state

You can start a development build with a preloaded wallet state, by adding `TEST_SRP='<insert SRP here>'` and `PASSWORD='<insert wallet password here>'` to the `.metamaskrc` file. Then you have the following options:

1. Start the wallet with the default fixture flags, by running `yarn start:with-state`.
2. Check the list of available fixture flags, by running `yarn start:with-state --help`.
3. Start the wallet with custom fixture flags, by running `yarn start:with-state --FIXTURE_NAME=VALUE` for example `yarn start:with-state --withAccounts=100`. You can pass as many flags as you want. The rest of the fixtures will take the default values.

#### Advanced Webpack builds

`yarn start` is backed by Webpack. You can also call `yarn webpack` directly for advanced build-system debugging; see the [Webpack README](./development/webpack/README.md) for more information.

`yarn start:lavamoat` is not currently supported because Webpack watch mode does not support LavaMoat. For production-like LavaMoat verification, use `yarn webpack:lavamoat:build` or `yarn build:test`.

#### React and Redux DevTools

To use React or Redux DevTools you'll first need to set `METAMASK_REACT_REDUX_DEVTOOLS` to `true` in `.metamaskrc`.

To start the [React DevTools](https://github.com/facebook/react-devtools), run `yarn devtools:react` with a development build installed in a browser. This will open in a separate window; no browser extension is required.

To start the [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools/tree/main/extension):

- Install the package `remotedev-server` globally (e.g. `yarn global add remotedev-server`)
- Install the Redux Devtools extension.
- Open the Redux DevTools extension and check the "Use custom (local) server" checkbox in the Remote DevTools Settings, using the default server configuration (host `localhost`, port `8000`, secure connection checkbox unchecked).

Then run the command `yarn devtools:redux` with a development build installed in a browser. This will enable you to use the Redux DevTools extension to inspect MetaMask.

To create a development build and run both of these tools simultaneously, run `yarn start:dev`.

#### Test Dapp

[This test site](https://metamask.github.io/test-dapp/) can be used to execute different user flows.

### Running Unit Tests and Linting

Run unit tests and the linter with `yarn test`. To run just unit tests, run `yarn test:unit`.

You can run the linter by itself with `yarn lint`, and you can automatically fix some lint problems with `yarn lint:fix`. You can also run these two commands just on your local changes to save time with `yarn lint:changed` and `yarn lint:changed:fix` respectively.

For Jest debugging guide using Node.js, see [docs/tests/jest.md](docs/tests/jest.md).

### Running E2E Tests

Our e2e test suite can be run on either Firefox or Chrome. Here's how to get started with e2e testing:

#### Preparing a Test Build

Before running e2e tests, ensure you've run `yarn install` to download dependencies. Next, you'll need a test build. You have 3 options:

1. Use `yarn download-builds --build-type test` to quickly download and unzip test builds for Chrome and Firefox into the `./dist/` folder. This method is fast and convenient for standard testing.
2. Create a custom production-like Webpack test build. This command allows you to generate test builds for various types, including:
   - `yarn build:test` for main build
   - `yarn build:test:flask` for flask build
   - `yarn build:test:mv2` for mv2 build
3. Start a Webpack test build with live changes: `yarn start:test` is particularly useful for development. It starts a test build that automatically recompiles application code upon changes. This option is ideal for iterative testing and development. This command also allows you to generate test builds for various types, including:
   - `yarn start:test` for main build
   - `yarn start:test:flask` for flask build
   - `yarn start:test:mv2` for mv2 build

Note: The `yarn start:test` command has LavaMoat and Snow disabled for faster iteration. Use `yarn build:test` for production-like LavaMoat verification.

#### Running Tests

Once you have your test build ready, choose the browser for your e2e tests:

- For Firefox, run `yarn test:e2e:firefox`.
  - Note: If you are running Firefox as a snap package on Linux, ensure you enable the appropriate environment variable: `FIREFOX_SNAP=true yarn test:e2e:firefox`
- For Chrome, run `yarn test:e2e:chrome`.

These scripts support additional options for debugging. Use `--help`to see all available options.

Specs that have been migrated from Selenium to Playwright (`*.pw.spec.ts`, see [test/e2e/playwright/README.md](test/e2e/playwright/README.md)) run through their own runner:

- For Firefox, run `yarn test:e2e:playwright:firefox`.
- For Chrome, run `yarn test:e2e:playwright:chrome`.

One-time setup for the Playwright runner (per machine, and again whenever the Playwright version changes):

```console
yarn                                        # installs the Playwright package
yarn playwright install chromium firefox   # downloads the browser binaries
```

#### Running a single e2e test

Single e2e tests can be run with `yarn test:e2e:single test/e2e/tests/TEST_NAME.spec.js` along with the options below.

```console
  --browser           Set the browser to be used; specify 'chrome', 'firefox', 'all'
                      or leave unset to run on 'all' by default.
                                                          [string] [default: 'all']
  --debug             Run tests in debug mode, logging each driver interaction
                                                         [boolean] [default: true]
  --retries           Set how many times the test should be retried upon failure.
                                                              [number] [default: 0]
  --leave-running     Leaves the browser running after a test fails, along with
                      anything else that the test used (the local node, the
                      test dapp, etc.)                   [boolean] [default: false]
  --update-snapshot   Update E2E test snapshots
                                             [alias: -u] [boolean] [default: false]
```

For example, to run the `account-details` tests using Chrome, with debug logging and with the browser set to remain open upon failure, you would use:
`yarn test:e2e:single test/e2e/tests/account-menu/account-details.spec.js --browser=chrome --leave-running`

For migrated Playwright specs, pass the spec path as a positional filter to the Playwright runner instead:

```console
# Run a single spec
yarn test:e2e:playwright:chrome test/e2e/tests/settings/terms-of-use.pw.spec.ts

# Run headless
PLAYWRIGHT_HEADLESS=1 yarn test:e2e:playwright:chrome test/e2e/tests/settings/terms-of-use.pw.spec.ts

# Debug with the Playwright Inspector (step through each driver action)
PWDEBUG=1 yarn test:e2e:playwright:chrome test/e2e/tests/settings/terms-of-use.pw.spec.ts
```

#### Running E2E tests with feature flags

Feature flags used in tests fall into two categories: remote flags (runtime values fetched from client-config) and build-time flags (compile-time values set during the build). Use the workflow that matches the flag type.

##### Remote feature flags (runtime)

Remote flags are provided at runtime and should usually follow production defaults from the [Feature Flag Registry](./test/e2e/feature-flags/feature-flag-registry.ts). You do not need a custom build just to change a remote flag value for a test.

Use one of these test-time overrides:

- **`manifestFlags` in `withFixtures`** — best for simple, test-wide flag overrides that don't depend on other fixture state.
- **`FixtureBuilder.withRemoteFeatureFlags()`** — best when you need the flag change to interact with other fixture state. Note: this method is only available on the legacy `FixtureBuilder`; use this builder when you need it, even for new tests.

For code examples and detailed guidelines, see [Feature flags in E2E tests](https://github.com/MetaMask/contributor-docs/blob/main/docs/testing/e2e-testing.md#feature-flags-in-e2e-tests) in contributor-docs.

##### Build-time feature flags (compile-time)

Build-time flags are set before running tests and require creating a test build with the flag enabled. Set the flag either in your local `.metamaskrc` file or as an environment variable prefix (e.g. `MULTICHAIN=1 yarn build:test`), then follow the steps in [Preparing a Test Build](#preparing-a-test-build) to create and run the build.

#### Feature Flag Registry

The [Feature Flag Registry](./test/e2e/feature-flags/feature-flag-registry.ts) is the central source of truth for all remote feature flags used in MetaMask Extension E2E tests. A [CI check](./.github/workflows/check-feature-flag-registry.yml) runs on every PR to verify that every remote flag reference in changed files exists in the registry. For background on how remote feature flags work in MetaMask, see the [Remote Feature Flags](https://github.com/MetaMask/contributor-docs/blob/main/docs/remote-feature-flags.md) contributor doc.

##### Registry entry format

Each entry in `test/e2e/feature-flags/feature-flag-registry.ts` has the following shape:

```typescript
myNewFlag: {
  name: 'myNewFlag',
  type: FeatureFlagType.Remote,
  inProd: true,
  productionDefault: false,
  status: FeatureFlagStatus.Active,
},
```

| Field               | Description                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `name`              | Must match the object key exactly                                                       |
| `type`              | `FeatureFlagType.Remote` (fetched at runtime) or `FeatureFlagType.Build` (compile-time) |
| `inProd`            | Whether the flag currently exists in the production client-config API                   |
| `productionDefault` | Any valid JSON value (`Json` type — boolean, number, string, null, object, or array)    |
| `status`            | `FeatureFlagStatus.Active` or `FeatureFlagStatus.Deprecated`                            |

##### Add a flag to the registry

For the full process of creating a remote feature flag (LaunchDarkly setup, code integration), see the [Remote Feature Flags](https://github.com/MetaMask/contributor-docs/blob/main/docs/remote-feature-flags.md) contributor doc. Once the flag exists, register it for E2E tests:

1. Look up the flag's current production value from the [client-config API](https://client-config.api.cx.metamask.io/v1/flags?client=extension&distribution=main&environment=prod). If the flag is not yet in production, set `inProd: false` and `productionDefault` to the intended default.
2. Add an entry to `test/e2e/feature-flags/feature-flag-registry.ts` in alphabetical order.
3. If you access the flag via a constant (e.g. `remoteFeatureFlags[MY_CONSTANT]`), also add the constant mapping to [`.github/scripts/known-feature-flag-constants.mts`](./.github/scripts/known-feature-flag-constants.mts) so the CI check can resolve it.

##### Override flags in E2E tests

To test behavior with a flag value different from the production default, see the override examples in [Remote feature flags (runtime)](#remote-feature-flags-runtime) above.

The registry module also exports helper functions for use in tests and tooling (e.g. `getProductionRemoteFlagApiResponse()`, `getProductionRemoteFlagDefaults()`). See the JSDoc in [feature-flag-registry.ts](./test/e2e/feature-flags/feature-flag-registry.ts) for details.

##### Remove a flag

When a remote feature flag is fully rolled out or no longer needed:

1. Remove all references to the flag from application code (`app/`, `ui/`, `shared/`).
2. Either remove the entry from the registry, or change its `status` to `FeatureFlagStatus.Deprecated` if you want to track it temporarily.
3. The CI check will post a warning on PRs that remove the last codebase reference to a registered flag, reminding you to clean up the registry.

#### Running E2E performance benchmarks

E2E performance benchmarks measure flow timings (onboarding, send, swap, asset details, etc.) and can be run locally or in CI. Use `yarn test:e2e:benchmark` with `--preset <name>` or a file path. See [test/e2e/benchmarks/flows/README.md](test/e2e/benchmarks/flows/README.md) for presets and options.

#### Running specific builds types e2e test

Different build types have different e2e tests sets. In order to run them look in the `package.json` file. You will find:

```console
    "test:e2e:chrome:snaps": "SELENIUM_BROWSER=chrome node test/e2e/run-all.js --snaps",
    "test:e2e:firefox": "SELENIUM_BROWSER=firefox node test/e2e/run-all.js",
```

### Test and iterate on GitHub Actions more quickly

Running the full workflow on GitHub Actions can take 30 minutes or more, but there are ways to speed it up for faster iteration

- **Automatic build reuse** — CI automatically detects when a PR's build-affecting source files haven't changed compared to a prior run (on the same branch or the base branch). When a match is found, it reuses the existing build artifacts instead of rebuilding, saving ~4 minutes for the webpack builds. This happens transparently with no action needed from you.
  - `[force-builds]` in the last commit message, or a `force-builds` label on the PR — Forces fresh builds even when CI would otherwise reuse prior artifacts. Useful when you need to verify that builds work after changing only non-code files (CI configs, docs, etc.), or if the automatic system is making a mistake.
  - `[skip-builds]` in the last commit message, or a `skip-builds` label on the PR — Reuses builds from the most recent prior run **without** verifying the source hash. This is the fastest option for iterating on tests or non-build changes, but it **blocks merging** — you must remove the tag/label and push again before the PR can enter the merge queue.
- **Automatic E2E skipping** — CI automatically skips E2E tests when the PR's changes don't require them (e.g., docs-only, CI-only, or test-only changes with reused builds). You can override this in both directions:
  - `[skip-e2e]` in the last commit message, or a `skip-e2e` label on the PR — Forces E2E tests to be skipped regardless of what files changed.
  - `[force-e2e]` in the last commit message, or a `force-e2e` label on the PR — Forces E2E tests to run even when CI would otherwise skip them. Useful for CI-only PRs that modify E2E workflow files.
- `[skip-unit]` in the last commit message _(command not working yet, coming soon)_ - Skips the unit test suite
- `trigger-ci-*` as the branch name - This allows you to run the CI workflow without attaching it to a PR. This is useful if you need to test some things that you know will never be merged. Please clean up after yourself when you're done, and delete the branch.

### Changing dependencies

Whenever you change dependencies (adding, removing, or updating, either in `package.json` or `yarn.lock`), there are various files that must be kept up-to-date.

- `yarn.lock`:
  - Run `yarn` again after your changes to ensure `yarn.lock` has been properly updated.
  - Run `yarn lint:lockfile:dedupe:fix` to remove duplicate dependencies from the lockfile.
- The `allow-scripts` configuration in `package.json`
  - Run `yarn allow-scripts auto` to update the `allow-scripts` configuration automatically. This config determines whether the package's install/postinstall scripts are allowed to run. Review each new package to determine whether the install script needs to run or not, testing if necessary.
  - Unfortunately, `yarn allow-scripts auto` will behave inconsistently on different platforms. macOS and Windows users may see extraneous changes relating to optional dependencies.
- The LavaMoat policy files
  - If you are a MetaMask team member and your PR is on a repository branch, you can use the bot command `@metamaskbot update-policies` to ask the MetaMask bot to automatically update the policies for you.
  - If your PR is from a fork, you can ask a MetaMask team member to help with updating the policy files.
  - Manual update instructions: The _tl;dr_ is to run `yarn lavamoat:auto` to update these files, but there can be devils in the details:
    - The webpack app LavaMoat policy files live under `lavamoat/webpack/*/policy.json` and are re-generated by `yarn lavamoat:auto`.
      - These should be regenerated whenever the production dependencies for the app change.
    - Whenever you regenerate a policy file, review the changes to determine whether the access granted to each package seems appropriate.
    - Unfortunately, `yarn lavamoat:auto` will behave inconsistently on different platforms.
      macOS and Windows users may see extraneous changes relating to optional dependencies.
    - If you keep getting policy failures even after regenerating the policy files, try regenerating the policies after a clean install by doing:
      - `rm -rf node_modules/ && yarn && yarn lavamoat:auto`
    - Keep in mind that any kind of dynamic import or dynamic use of globals may elude LavaMoat's static analysis.
      Refer to the LavaMoat documentation or ask for help if you run into any issues.

`attribution.txt` is generated by the release process. **Do not generate it or commit and push changes to it in PRs**, including dependency updates.

## Architecture

- [Visual of the controller hierarchy and dependencies as of summer 2022.](https://gist.github.com/rekmarks/8dba6306695dcd44967cce4b6a94ae33)
- [Visual of the entire codebase.](https://mango-dune-07a8b7110.1.azurestaticapps.net/?repo=metamask%2Fmetamask-extension)

[![Architecture Diagram](./docs/architecture.png)][1]

## Other Docs

- [How to add a new translation to MetaMask](./docs/translating-guide.md)
- [Publishing Guide](./docs/publishing.md)
- [How to use the TREZOR emulator](./docs/trezor-emulator.md)
- [Developing on MetaMask](./development/README.md)
- [How to generate a visualization of this repository's development](./development/gource-viz.sh)
- [How to add new confirmations](./docs/confirmations.md)
- [Browser support guidelines](./docs/browser-support.md)

## Dapp Developer Resources

- [Extend MetaMask's features w/ MetaMask Snaps.](https://docs.metamask.io/snaps/)
- [Prompt your users to add and switch to a new network.](https://docs.metamask.io/wallet/how-to/add-network/)
- [Change the logo that appears when your dapp connects to MetaMask.](https://docs.metamask.io/wallet/how-to/display/icon/)

[1]: http://www.nomnoml.com/#view/%5B%3Cactor%3Euser%5D%0A%0A%5Bmetamask-ui%7C%0A%20%20%20%5Btools%7C%0A%20%20%20%20%20react%0A%20%20%20%20%20redux%0A%20%20%20%20%20thunk%0A%20%20%20%20%20ethUtils%0A%20%20%20%20%20jazzicon%0A%20%20%20%5D%0A%20%20%20%5Bcomponents%7C%0A%20%20%20%20%20app%0A%20%20%20%20%20account-detail%0A%20%20%20%20%20accounts%0A%20%20%20%20%20locked-screen%0A%20%20%20%20%20restore-vault%0A%20%20%20%20%20identicon%0A%20%20%20%20%20config%0A%20%20%20%20%20info%0A%20%20%20%5D%0A%20%20%20%5Breducers%7C%0A%20%20%20%20%20app%0A%20%20%20%20%20metamask%0A%20%20%20%20%20identities%0A%20%20%20%5D%0A%20%20%20%5Bactions%7C%0A%20%20%20%20%20%5BbackgroundConnection%5D%0A%20%20%20%5D%0A%20%20%20%5Bcomponents%5D%3A-%3E%5Bactions%5D%0A%20%20%20%5Bactions%5D%3A-%3E%5Breducers%5D%0A%20%20%20%5Breducers%5D%3A-%3E%5Bcomponents%5D%0A%5D%0A%0A%5Bweb%20dapp%7C%0A%20%20%5Bui%20code%5D%0A%20%20%5Bweb3%5D%0A%20%20%5Bmetamask-inpage%5D%0A%20%20%0A%20%20%5B%3Cactor%3Eui%20developer%5D%0A%20%20%5Bui%20developer%5D-%3E%5Bui%20code%5D%0A%20%20%5Bui%20code%5D%3C-%3E%5Bweb3%5D%0A%20%20%5Bweb3%5D%3C-%3E%5Bmetamask-inpage%5D%0A%5D%0A%0A%5Bmetamask-background%7C%0A%20%20%5Bprovider-engine%5D%0A%20%20%5Bhooked%20wallet%20subprovider%5D%0A%20%20%5Bid%20store%5D%0A%20%20%0A%20%20%5Bprovider-engine%5D%3C-%3E%5Bhooked%20wallet%20subprovider%5D%0A%20%20%5Bhooked%20wallet%20subprovider%5D%3C-%3E%5Bid%20store%5D%0A%20%20%5Bconfig%20manager%7C%0A%20%20%20%20%5Brpc%20configuration%5D%0A%20%20%20%20%5Bencrypted%20keys%5D%0A%20%20%20%20%5Bwallet%20nicknames%5D%0A%20%20%5D%0A%20%20%0A%20%20%5Bprovider-engine%5D%3C-%5Bconfig%20manager%5D%0A%20%20%5Bid%20store%5D%3C-%3E%5Bconfig%20manager%5D%0A%5D%0A%0A%5Buser%5D%3C-%3E%5Bmetamask-ui%5D%0A%0A%5Buser%5D%3C%3A--%3A%3E%5Bweb%20dapp%5D%0A%0A%5Bmetamask-contentscript%7C%0A%20%20%5Bplugin%20restart%20detector%5D%0A%20%20%5Brpc%20passthrough%5D%0A%5D%0A%0A%5Brpc%20%7C%0A%20%20%5Bethereum%20blockchain%20%7C%0A%20%20%20%20%5Bcontracts%5D%0A%20%20%20%20%5Baccounts%5D%0A%20%20%5D%0A%5D%0A%0A%5Bweb%20dapp%5D%3C%3A--%3A%3E%5Bmetamask-contentscript%5D%0A%5Bmetamask-contentscript%5D%3C-%3E%5Bmetamask-background%5D%0A%5Bmetamask-background%5D%3C-%3E%5Bmetamask-ui%5D%0A%5Bmetamask-background%5D%3C-%3E%5Brpc%5D%0A
