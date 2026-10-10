import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import type { Hex } from '@metamask/utils';
import { getNetworkConfigurationsByChainId } from '../../../shared/lib/selectors/networks';
import {
  getCodeHashVerdict,
  hashContractCode,
  type CodeVerdict,
} from '../../../shared/lib/swissquote/swissquote-registry';
import { getCode } from '../../store/actions';

export type SwissquoteContractToCheck = {
  address: Hex;
  chainId?: Hex;
  /** Takes precedence over `chainId` when the caller already knows it. */
  networkClientId?: string;
  label?: string;
};

export type SwissquoteContractVerdict =
  | CodeVerdict
  /** Nothing is deployed at the address (e.g. a wallet, not a contract). */
  | 'no-code'
  /** The code could not be fetched (network not added, RPC error). */
  | 'error';

export type SwissquoteContractCheckResult = SwissquoteContractToCheck & {
  verdict?: SwissquoteContractVerdict;
  codeHash?: string;
};

/**
 * Runs the Swissquote code check on each contract: downloads its bytecode,
 * hashes it with SHA-256 and looks the hash up in the Swissquote registry.
 *
 * @param contracts - The contracts to check.
 * @returns Whether checks are still running, and one result per contract.
 */
export function useSwissquoteContractChecks(
  contracts: SwissquoteContractToCheck[],
): { loading: boolean; results: SwissquoteContractCheckResult[] } {
  const networkConfigurationsByChainId = useSelector(
    getNetworkConfigurationsByChainId,
  );

  // Resolve which network to query for each contract.
  const resolved = useMemo(
    () =>
      contracts.map((contract) => {
        if (contract.networkClientId || !contract.chainId) {
          return contract;
        }
        const configuration =
          networkConfigurationsByChainId?.[contract.chainId];
        const endpoint =
          configuration?.rpcEndpoints[configuration.defaultRpcEndpointIndex];
        return { ...contract, networkClientId: endpoint?.networkClientId };
      }),
    [contracts, networkConfigurationsByChainId],
  );

  const checksKey = resolved
    .map((contract) => `${contract.networkClientId}:${contract.address}`)
    .join('|');

  const [results, setResults] = useState<SwissquoteContractCheckResult[]>(resolved);
  const [loading, setLoading] = useState(resolved.length > 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(resolved.length > 0);
    setResults(resolved);

    Promise.all(
      resolved.map(async (contract): Promise<SwissquoteContractCheckResult> => {
        if (!contract.networkClientId) {
          return { ...contract, verdict: 'error' };
        }
        try {
          const code = await getCode(
            contract.address,
            contract.networkClientId,
          );
          if (!code || code === '0x' || code === '0x0') {
            return { ...contract, verdict: 'no-code' };
          }
          const codeHash = await hashContractCode(code);
          return {
            ...contract,
            codeHash,
            verdict: getCodeHashVerdict(codeHash),
          };
        } catch {
          return { ...contract, verdict: 'error' };
        }
      }),
    ).then((checked) => {
      if (!cancelled) {
        setResults(checked);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // `checksKey` captures everything in `resolved` that affects the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checksKey]);

  return { loading, results };
}
