import React from 'react';
import {
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
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
import { ConfirmInfoRow } from '../../../../../../../components/app/confirm/info/row';
import { useI18nContext } from '../../../../../../../hooks/useI18nContext';
import { useConfirmContext } from '../../../../../context/confirm';
import { useGasSponsorshipPreference } from '../../../../../hooks/gas/useGasSponsorshipPreference';
import { useIsGaslessSupported } from '../../../../../hooks/gas/useIsGaslessSupported';

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
 * themselves or send the transaction gasless. Gasless is offered when either
 * - MetaMask's relay sponsors the transaction (e.g. on Monad), as in base
 * MetaMask; or
 * - the network has a Swissquote gas station (see `SWISSQUOTE_GAS_STATIONS`).
 */
export function GasPaymentSelector() {
  const t = useI18nContext();
  const { currentConfirmation: transactionMeta } =
    useConfirmContext<TransactionMeta>();
  const { isSponsorshipOptedOut, setSponsorshipOptedOut } =
    useGasSponsorshipPreference(transactionMeta?.chainId);

  const { isSupported: isGaslessSupported } = useIsGaslessSupported();

  const hasGasStation = Boolean(
    getSwissquoteGasStation(transactionMeta?.chainId),
  );
  // Same eligibility rule MetaMask uses for its "Paid by MetaMask" fee row.
  const isMetaMaskSponsored = Boolean(
    isGaslessSupported &&
    transactionMeta?.isGasFeeSponsored &&
    transactionMeta?.type !== TransactionType.revokeDelegation,
  );
  const isGaslessAvailable = hasGasStation || isMetaMaskSponsored;
  const isGaslessSelected = isGaslessAvailable && !isSponsorshipOptedOut;

  let gaslessHint = t('swissquoteGasGaslessUnavailable');
  if (hasGasStation) {
    gaslessHint = t('swissquoteGasGaslessFree');
  } else if (isMetaMaskSponsored) {
    gaslessHint = t('paidByMetaMask');
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
