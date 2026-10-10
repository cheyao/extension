import React, { useMemo, useState } from 'react';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { isSnapId } from '@metamask/snaps-utils';
import {
  SwissquoteVerificationModal,
  type SwissquoteCheck as SwissquoteCheckResult,
} from '../../../../../components/app/swissquote-verification';
import {
  isAddressVerifiedBySwissquote,
  isOriginVerifiedBySwissquote,
} from '../../../../../../shared/lib/swissquote/swissquote-verified-dapps';
import { ORIGIN_METAMASK } from '../../../../../../shared/constants/app';
import { MetaMetricsEventLocation } from '../../../../../../shared/constants/metametrics';
import { useConfirmContext } from '../../../context/confirm';
import { useConfirmActions } from '../../../hooks/useConfirmActions';
import type { SignatureRequestType } from '../../../types/confirm';

/**
 * Gets the dApp origin of a transaction or signature request.
 *
 * @param confirmation - The current confirmation.
 * @returns The origin, if any.
 */
function getConfirmationOrigin(
  confirmation: TransactionMeta | SignatureRequestType | undefined,
): string | undefined {
  if (!confirmation) {
    return undefined;
  }
  return (
    confirmation.origin ??
    (confirmation as SignatureRequestType).msgParams?.origin
  );
}

/**
 * Gets the contract a dApp transaction interacts with. Plain transfers carry
 * no calldata and are not contract interactions.
 *
 * @param confirmation - The current confirmation.
 * @returns The contract address, if any.
 */
function getContractAddress(
  confirmation: TransactionMeta | SignatureRequestType | undefined,
): string | undefined {
  const { txParams } = (confirmation ?? {}) as Partial<TransactionMeta>;
  if (!txParams?.to || !txParams.data || txParams.data === '0x') {
    return undefined;
  }
  return txParams.to;
}

/**
 * Swissquote verified dApps check for confirmations: when a dApp asks for a
 * transaction or signature, pops up whether the site (and, for transactions,
 * the contract) is on Swissquote's verified list. Shown once per request.
 */
export function SwissquoteCheck() {
  const { currentConfirmation } = useConfirmContext<
    TransactionMeta | SignatureRequestType
  >();
  const { onCancel } = useConfirmActions();
  const [dismissedId, setDismissedId] = useState<string>();

  const origin = getConfirmationOrigin(currentConfirmation);
  const contractAddress = getContractAddress(currentConfirmation);

  const checks = useMemo<SwissquoteCheckResult[]>(() => {
    const isDappRequest =
      Boolean(origin) && origin !== ORIGIN_METAMASK && !isSnapId(origin);
    if (!origin || !isDappRequest) {
      return [];
    }
    const result: SwissquoteCheckResult[] = [
      {
        kind: 'site',
        value: origin,
        isVerified: isOriginVerifiedBySwissquote(origin),
      },
    ];
    if (contractAddress) {
      result.push({
        kind: 'contract',
        value: contractAddress,
        isVerified: isAddressVerifiedBySwissquote(contractAddress),
      });
    }
    return result;
  }, [origin, contractAddress]);

  const confirmationId = currentConfirmation?.id;

  if (
    !confirmationId ||
    checks.length === 0 ||
    dismissedId === confirmationId
  ) {
    return null;
  }

  return (
    <SwissquoteVerificationModal
      checks={checks}
      onContinue={() => setDismissedId(confirmationId)}
      onCancel={async () => {
        setDismissedId(confirmationId);
        await onCancel({ location: MetaMetricsEventLocation.Confirmation });
      }}
    />
  );
}
