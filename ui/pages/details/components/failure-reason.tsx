import React from 'react';
import { useSelector } from 'react-redux';
import {
  TransactionStatus,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import {
  Box,
  BoxFlexDirection,
  FontWeight,
  Text,
  TextColor,
  TextVariant,
} from '@metamask/design-system-react';
import { getTransactions } from '../../../selectors/transactions';
import { useI18nContext } from '../../../hooks/useI18nContext';

type Props = {
  /** Transaction hash, or the local transaction id when it has no hash. */
  txIdentifier: string | undefined;
};

/**
 * Shows why a local transaction failed (the error recorded by the
 * TransactionController), so failures without an on-chain hash are not just
 * labelled "Failed".
 *
 * @param props - Component props.
 * @param props.txIdentifier - Transaction hash or local transaction id.
 */
export function FailureReason({ txIdentifier }: Props) {
  const t = useI18nContext();
  const transactions = useSelector(getTransactions) as TransactionMeta[];

  if (!txIdentifier) {
    return null;
  }

  const identifier = txIdentifier.toLowerCase();
  const transaction = transactions.find(
    (tx) =>
      tx.id?.toLowerCase() === identifier ||
      tx.hash?.toLowerCase() === identifier,
  );

  if (transaction?.status !== TransactionStatus.failed || !transaction.error) {
    return null;
  }

  const { message, code, rpc } = transaction.error as {
    message?: string;
    code?: string | number;
    rpc?: unknown;
  };
  const details = [
    code === undefined ? undefined : `code ${code}`,
    rpc ? JSON.stringify(rpc) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={1}
      padding={3}
      marginBottom={4}
      className="rounded-lg bg-error-muted"
      data-testid="transaction-failure-reason"
    >
      <Text
        variant={TextVariant.BodySm}
        fontWeight={FontWeight.Medium}
        color={TextColor.ErrorDefault}
      >
        {t('transactionFailureReason')}
      </Text>
      <Text variant={TextVariant.BodySm} className="break-words select-text">
        {message ?? t('transactionFailureReasonUnknown')}
      </Text>
      {details && (
        <Text
          variant={TextVariant.BodyXs}
          color={TextColor.TextAlternative}
          className="break-all select-text font-mono"
        >
          {details}
        </Text>
      )}
    </Box>
  );
}
