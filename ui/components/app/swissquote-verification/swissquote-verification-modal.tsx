import React from 'react';
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
  TextAlign,
  TextColor,
  TextVariant,
} from '@metamask/design-system-react';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from '../../component-library';

export type SwissquoteCheck = {
  /** What was checked, e.g. the site or the contract. */
  kind: 'site' | 'contract';
  /** The origin or address that was looked up. */
  value: string;
  /** Whether it is on Swissquote's verified list. */
  isVerified: boolean;
};

type SwissquoteVerificationModalProps = Readonly<{
  checks: SwissquoteCheck[];
  onContinue: () => void;
  onCancel: () => void;
}>;

/**
 * Popup with the result of the Swissquote verified dApps check: "Verified by
 * Swissquote" when every checked item is on the list, "Not recognised by
 * Swissquote" otherwise, with one row per checked site or contract.
 *
 * @param props - Component props.
 * @param props.checks - The lookups to display.
 * @param props.onContinue - Called when the user proceeds.
 * @param props.onCancel - Called when the user closes or cancels.
 */
export function SwissquoteVerificationModal({
  checks,
  onContinue,
  onCancel,
}: SwissquoteVerificationModalProps) {
  const t = useI18nContext();
  const isVerified = checks.every((check) => check.isVerified);

  return (
    <Modal
      isOpen
      onClose={onCancel}
      data-testid="swissquote-verification-modal"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader onClose={onCancel} startAccessory={<span />} />
        <Box
          flexDirection={BoxFlexDirection.Column}
          alignItems={BoxAlignItems.Center}
          gap={3}
          paddingTop={2}
          paddingBottom={4}
          paddingLeft={4}
          paddingRight={4}
        >
          <img
            src="./images/logo/swissquote-logo.svg"
            width="40"
            height="40"
            alt=""
          />
          <Box
            flexDirection={BoxFlexDirection.Row}
            alignItems={BoxAlignItems.Center}
            gap={2}
          >
            <Icon
              name={isVerified ? IconName.SecurityTick : IconName.Warning}
              size={IconSize.Lg}
              color={
                isVerified ? IconColor.SuccessDefault : IconColor.WarningDefault
              }
            />
            <Text
              variant={TextVariant.HeadingMd}
              data-testid="swissquote-verification-status"
            >
              {isVerified
                ? t('swissquoteVerifiedTitle')
                : t('swissquoteNotRecognisedTitle')}
            </Text>
          </Box>
          <Text
            variant={TextVariant.BodyMd}
            color={TextColor.TextAlternative}
            textAlign={TextAlign.Center}
          >
            {isVerified
              ? t('swissquoteVerifiedDescription')
              : t('swissquoteNotRecognisedDescription')}
          </Text>
        </Box>

        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={2}
          paddingLeft={4}
          paddingRight={4}
          paddingBottom={4}
        >
          {checks.map((check) => (
            <Box
              key={`${check.kind}:${check.value}`}
              flexDirection={BoxFlexDirection.Row}
              alignItems={BoxAlignItems.Center}
              justifyContent={BoxJustifyContent.Between}
              gap={3}
              padding={3}
              className="rounded-lg bg-section"
            >
              <Box flexDirection={BoxFlexDirection.Column} className="min-w-0">
                <Text
                  variant={TextVariant.BodySm}
                  color={TextColor.TextAlternative}
                >
                  {check.kind === 'site'
                    ? t('swissquoteCheckSite')
                    : t('swissquoteCheckContract')}
                </Text>
                <Text
                  variant={TextVariant.BodyMd}
                  fontWeight={FontWeight.Medium}
                  className="truncate"
                >
                  {check.value}
                </Text>
              </Box>
              <Box
                flexDirection={BoxFlexDirection.Row}
                alignItems={BoxAlignItems.Center}
                gap={1}
                className="shrink-0"
              >
                <Icon
                  name={
                    check.isVerified ? IconName.Confirmation : IconName.Question
                  }
                  size={IconSize.Sm}
                  color={
                    check.isVerified
                      ? IconColor.SuccessDefault
                      : IconColor.WarningDefault
                  }
                />
                <Text
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  color={
                    check.isVerified
                      ? TextColor.SuccessDefault
                      : TextColor.WarningDefault
                  }
                >
                  {check.isVerified
                    ? t('swissquoteCheckVerified')
                    : t('swissquoteCheckNotRecognised')}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>

        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={3}
          paddingLeft={4}
          paddingRight={4}
          paddingBottom={4}
        >
          <Button
            variant={ButtonVariant.Primary}
            size={ButtonSize.Lg}
            className="w-full"
            onClick={onContinue}
            data-testid="swissquote-verification-continue"
          >
            {isVerified ? t('continue') : t('swissquoteContinueAnyway')}
          </Button>
          {!isVerified && (
            <Button
              variant={ButtonVariant.Secondary}
              size={ButtonSize.Lg}
              className="w-full"
              onClick={onCancel}
              data-testid="swissquote-verification-cancel"
            >
              {t('cancel')}
            </Button>
          )}
        </Box>
      </ModalContent>
    </Modal>
  );
}
