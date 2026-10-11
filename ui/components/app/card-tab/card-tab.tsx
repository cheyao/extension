import React, { useCallback, useState } from 'react';
import {
  Box,
  BoxAlignItems,
  BoxFlexDirection,
  BoxJustifyContent,
  Button,
  ButtonSize,
  ButtonVariant,
  FontWeight,
  Icon,
  IconColor,
  IconName,
  IconSize,
  Text,
  TextColor,
  TextVariant,
} from '@metamask/design-system-react';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { CardTopUpModal } from './card-top-up-modal';

// Mock card details — there is no card backend yet.
const MOCK_CARD = {
  holder: 'Swissquote Wallet',
  number: '4532 7781 0042 9917',
  cvc: '381',
  expiry: '09/29',
};

// Hardcoded until the wallet creation date is exposed to the UI.
const MOCK_CARD_CREATED_AT = new Date('2026-10-10T12:00:00Z');

// Swissquote look: black card with an orange glow from the top corner and a
// thin light edge, matching the Swissquote mark.
const SWISSQUOTE_CARD_STYLE: React.CSSProperties = {
  background:
    'radial-gradient(120% 90% at 100% 0%, rgba(239, 108, 26, 0.38), transparent 55%), linear-gradient(135deg, #1a1a1a, #050505)',
  boxShadow:
    'inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 14px 30px -18px rgba(239, 108, 26, 0.5)',
};

const maskCardNumber = (cardNumber: string) =>
  `•••• •••• •••• ${cardNumber.slice(-4)}`;

/**
 * Home tab showing a mock payment card, its actions and its transactions.
 */
export const CardTab = () => {
  const t = useI18nContext();
  const [showDetails, setShowDetails] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  const toggleDetails = useCallback(() => {
    setShowDetails((current) => !current);
  }, []);

  return (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      padding={4}
      data-testid="card-tab"
    >
      <Box
        flexDirection={BoxFlexDirection.Column}
        justifyContent={BoxJustifyContent.Between}
        padding={5}
        className="aspect-[1.586] w-full max-w-[360px] self-center rounded-2xl text-white"
        style={SWISSQUOTE_CARD_STYLE}
        data-testid="card-tab-card"
      >
        <Box
          flexDirection={BoxFlexDirection.Row}
          justifyContent={BoxJustifyContent.Between}
          alignItems={BoxAlignItems.Center}
        >
          <Box
            flexDirection={BoxFlexDirection.Row}
            alignItems={BoxAlignItems.Center}
            gap={2}
          >
            <img
              src="./images/logo/swissquote-logo.svg"
              width={28}
              height={28}
              alt=""
            />
            <Text
              variant={TextVariant.BodyMd}
              fontWeight={FontWeight.Bold}
              className="text-white"
            >
              Swissquote
            </Text>
          </Box>
          <Text
            variant={TextVariant.BodyXs}
            fontWeight={FontWeight.Medium}
            className="text-white/70"
          >
            {MOCK_CARD.holder}
          </Text>
        </Box>

        <Text
          variant={TextVariant.HeadingMd}
          fontWeight={FontWeight.Medium}
          className="font-mono tracking-widest text-white"
          data-testid="card-tab-number"
        >
          {showDetails ? MOCK_CARD.number : maskCardNumber(MOCK_CARD.number)}
        </Text>

        <Box flexDirection={BoxFlexDirection.Row} gap={6}>
          <Box flexDirection={BoxFlexDirection.Column}>
            <Text variant={TextVariant.BodyXs} className="text-white/70">
              {t('cardExpiry')}
            </Text>
            <Text
              variant={TextVariant.BodyMd}
              className="font-mono text-white"
              data-testid="card-tab-expiry"
            >
              {MOCK_CARD.expiry}
            </Text>
          </Box>
          <Box flexDirection={BoxFlexDirection.Column}>
            <Text variant={TextVariant.BodyXs} className="text-white/70">
              {t('cardCvc')}
            </Text>
            <Text
              variant={TextVariant.BodyMd}
              className="font-mono text-white"
              data-testid="card-tab-cvc"
            >
              {showDetails ? MOCK_CARD.cvc : '•••'}
            </Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection={BoxFlexDirection.Row} gap={3}>
        <Button
          variant={ButtonVariant.Primary}
          size={ButtonSize.Lg}
          className="flex-1"
          startIconName={IconName.Add}
          onClick={() => setIsTopUpOpen(true)}
          data-testid="card-tab-top-up"
        >
          {t('cardTopUp')}
        </Button>
        <Button
          variant={ButtonVariant.Secondary}
          size={ButtonSize.Lg}
          className="flex-1"
          startIconName={showDetails ? IconName.EyeSlash : IconName.Eye}
          onClick={toggleDetails}
          data-testid="card-tab-toggle-details"
        >
          {showDetails ? t('cardHideDetails') : t('cardShowDetails')}
        </Button>
      </Box>

      <Box flexDirection={BoxFlexDirection.Column} gap={2}>
        <Text variant={TextVariant.HeadingSm} fontWeight={FontWeight.Medium}>
          {t('transactions')}
        </Text>
        <Box
          flexDirection={BoxFlexDirection.Row}
          alignItems={BoxAlignItems.Center}
          gap={3}
          paddingVertical={2}
          data-testid="card-tab-transaction-card-created"
        >
          <Box
            flexDirection={BoxFlexDirection.Row}
            alignItems={BoxAlignItems.Center}
            justifyContent={BoxJustifyContent.Center}
            className="h-10 w-10 shrink-0 rounded-full bg-muted"
          >
            <Icon
              name={IconName.Card}
              size={IconSize.Md}
              color={IconColor.IconAlternative}
            />
          </Box>
          <Box flexDirection={BoxFlexDirection.Column}>
            <Text variant={TextVariant.BodyMd} fontWeight={FontWeight.Medium}>
              {t('cardCreated')}
            </Text>
            <Text
              variant={TextVariant.BodySm}
              color={TextColor.TextAlternative}
            >
              {MOCK_CARD_CREATED_AT.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </Box>
        </Box>
      </Box>
      {isTopUpOpen && <CardTopUpModal onClose={() => setIsTopUpOpen(false)} />}
    </Box>
  );
};

export default CardTab;
