/**
 * Shape of the `batchSell` remote feature flag after it has been resolved by
 * `RemoteFeatureFlagController`. The controller processes the raw
 * version-scoped format (`{ versions: { "11.0.0": { enabled: true } } }`)
 * and stores only the matching version's value, so the UI receives a flat
 * `{ enabled: boolean }` object.
 */
export type BatchSellFeatureFlag = {
  enabled?: boolean;
};

/**
 * Batch Sell has been removed, so it is always disabled regardless of the
 * `batchSell` remote feature flag.
 *
 * @param _state - The MetaMask Redux state.
 * @returns Always `false`.
 */
export const getIsBatchSellEnabled = (_state?: unknown) => false;
