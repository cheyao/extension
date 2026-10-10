import React from 'react';
import { useOriginTrustSignals } from '../../../hooks/useOriginTrustSignals';
import { TrustSignalDisplayState } from '../../../hooks/useTrustSignals';
import { TrustSignalModal } from '../../../components/app/trust-signal-modal/trust-signal-modal';
import { SwissquoteVerificationModal } from '../../../components/app/swissquote-verification';
import { isOriginVerifiedBySwissquote } from '../../../../shared/lib/swissquote/swissquote-verified-dapps';
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

  const showModal = !dismissed && state === TrustSignalDisplayState.Malicious;

  // Second check: Swissquote's verified dApps list. Shown once the MetaMask
  // check has resolved and any malicious-site warning has been dismissed.
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
          checks={[
            {
              kind: 'site',
              value: origin,
              isVerified: isOriginVerifiedBySwissquote(origin),
            },
          ]}
          onContinue={dismissSwissquote}
          onCancel={onCancel}
        />
      )}
      {children}
    </>
  );
}
