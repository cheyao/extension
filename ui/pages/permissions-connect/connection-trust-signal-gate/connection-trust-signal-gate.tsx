import React, { useMemo } from 'react';
import { useOriginTrustSignals } from '../../../hooks/useOriginTrustSignals';
import { TrustSignalDisplayState } from '../../../hooks/useTrustSignals';
import { TrustSignalModal } from '../../../components/app/trust-signal-modal/trust-signal-modal';
import { SwissquoteVerificationModal } from '../../../components/app/swissquote-verification';
import { useSwissquoteContractChecks } from '../../../hooks/swissquote/useSwissquoteContractChecks';
import { getRegisteredContractsForOrigin } from '../../../../shared/lib/swissquote/swissquote-registry';
import { useBoolean } from '../../../hooks/useBoolean';

type ConnectionTrustSignalGateProps = {
  origin: string;
  children: React.ReactNode;
  onCancel: () => void;
};

export function ConnectionTrustSignalGate({
  origin,
  children,
  onCancel,
}: Readonly<ConnectionTrustSignalGateProps>) {
  const { state } = useOriginTrustSignals(origin);
  const { value: dismissed, setTrue: dismiss } = useBoolean(false);
  const { value: swissquoteDismissed, setTrue: dismissSwissquote } =
    useBoolean(false);

  // Second check: hash the code of the contracts this dApp runs and compare it
  // with Swissquote's database of safe / unsafe code.
  const registeredContracts = useMemo(
    () => getRegisteredContractsForOrigin(origin),
    [origin],
  );
  const { loading, results } = useSwissquoteContractChecks(registeredContracts);

  const showModal = !dismissed && state === TrustSignalDisplayState.Malicious;

  // Shown once the MetaMask check has resolved and any malicious-site warning
  // has been dismissed.
  const showSwissquoteModal =
    Boolean(origin) &&
    !swissquoteDismissed &&
    !showModal &&
    state !== TrustSignalDisplayState.Loading;

  return (
    <>
      {showModal && (
        <TrustSignalModal onContinue={dismiss} onCancel={onCancel} />
      )}
      {showSwissquoteModal && (
        <SwissquoteVerificationModal
          origin={origin}
          loading={loading}
          results={results}
          onContinue={dismissSwissquote}
          onCancel={onCancel}
        />
      )}
      {children}
    </>
  );
}
