import React from 'react';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  Box,
  BoxAlignItems,
  BoxFlexDirection,
  FontWeight,
  Text,
  TextColor,
  TextVariant,
} from '@metamask/design-system-react';
import classnames from 'clsx';
import { getSwissquoteGasStation } from '../../../../../../../../shared/constants/swissquote';
import { MONAD_RESERVE_BALANCE_MON } from '../../../../../../../../shared/lib/monad-reserve-balance';
import { ConfirmInfoRow } from '../../../../../../../components/app/confirm/info/row';
import { useI18nContext } from '../../../../../../../hooks/useI18nContext';
import { useConfirmContext } from '../../../../../context/confirm';
import { useGasSponsorshipPreference } from '../../../../../hooks/gas/useGasSponsorshipPreference';

type OptionProps = {
  label: string;
  hint?: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  testId: string;
};

function GasPaymentOption({
  label,
  hint,
  isSelected,
  isDisabled = false,
  onClick,
  testId,
}: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-pressed={isSelected}
      data-testid={testId}
      className={classnames(
        'flex flex-col items-center rounded-lg border px-3 py-1',
        isSelected
          ? 'border-primary-default bg-primary-muted'
          : 'border-muted bg-transparent',
        isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <Text
        variant={TextVariant.BodySm}
        fontWeight={FontWeight.Medium}
        color={isSelected ? TextColor.PrimaryDefault : TextColor.TextDefault}
      >
        {label}
      </Text>
      {hint && (
        <Text variant={TextVariant.BodyXs} color={TextColor.TextAlternative}>
          {hint}
        </Text>
      )}
    </button>
  );
}

/**
 * Lets the user choose, per network, whether to pay the network fee
 * themselves or send the transaction gasless. Gasless is only offered on
 * networks with a Swissquote gas station (see `SWISSQUOTE_GAS_STATIONS`);
 * everywhere else it shows as unavailable.
 */
export function GasPaymentSelector() {
  const t = useI18nContext();
  const { currentConfirmation: transactionMeta } =
    useConfirmContext<TransactionMeta>();
  const {
    isSponsorshipOptedOut,
    isBlockedByMonadReserve,
    setSponsorshipOptedOut,
  } = useGasSponsorshipPreference(transactionMeta?.chainId);

  const hasGasStation = Boolean(
    getSwissquoteGasStation(transactionMeta?.chainId),
  );
  // Monad's 10 MON reserve rule rules out gasless for this transaction.
  const isGaslessAvailable = hasGasStation && !isBlockedByMonadReserve;
  const isGaslessSelected = isGaslessAvailable && !isSponsorshipOptedOut;

  let gaslessHint = t('swissquoteGasGaslessUnavailable');
  if (hasGasStation && isBlockedByMonadReserve) {
    gaslessHint = t('swissquoteGasMonadReserve', [MONAD_RESERVE_BALANCE_MON]);
  } else if (hasGasStation) {
    gaslessHint = t('swissquoteGasGaslessFree');
  }

  return (
    <ConfirmInfoRow
      label={t('swissquoteGasPayment')}
      data-testid="gas-payment-selector"
    >
      <Box
        flexDirection={BoxFlexDirection.Row}
        alignItems={BoxAlignItems.Center}
        gap={2}
      >
        <GasPaymentOption
          label={t('swissquoteGasPayFee')}
          isSelected={!isGaslessSelected}
          onClick={() => setSponsorshipOptedOut(true)}
          testId="gas-payment-option-pay"
        />
        <GasPaymentOption
          label={t('swissquoteGasGasless')}
          hint={gaslessHint}
          isSelected={isGaslessSelected}
          isDisabled={!isGaslessAvailable}
          onClick={() => setSponsorshipOptedOut(false)}
          testId="gas-payment-option-gasless"
        />
      </Box>
    </ConfirmInfoRow>
  );
}
