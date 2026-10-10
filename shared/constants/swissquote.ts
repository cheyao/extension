/**
 * Whether gasless (sponsored) transactions are available in Swissquote Wallet.
 *
 * Gasless transactions are relayed and paid for by a sponsor. Swissquote has
 * no sponsor yet, and MetaMask's relay rejects our transactions
 * (`FAILED_SPONSORSHIP_RULE`), so while this is `false`:
 * - every transaction is sent normally and the user pays the network fee;
 * - the "Gasless" option in the confirmation's gas selector shows as
 * "Coming soon";
 * - the fee is never switched automatically to a token paid through the relay.
 *
 * Flip to `true` once a sponsor is wired up.
 */
export const SWISSQUOTE_GASLESS_ENABLED = false;
