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
import type {
  SwissquoteContractCheckResult,
  SwissquoteContractVerdict,
} from '../../../hooks/swissquote/useSwissquoteContractChecks';
import { shortenAddress } from '../../../helpers/utils/util';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from '../../component-library';

export type SwissquoteOverallStatus =
  | 'checking'
  | 'safe'
  | 'unsafe'
  | 'not-recognised';

/**
 * Combines per-contract verdicts: any unsafe code makes the dApp unsafe, it is
 * safe only when every contract's code is known safe, and not recognised
 * otherwise (unknown code, nothing on record, or the check failed).
 *
 * @param loading - Whether checks are still running.
 * @param results - The per-contract results.
 * @returns The overall status.
 */
export function getSwissquoteOverallStatus(
  loading: boolean,
  results: SwissquoteContractCheckResult[],
): SwissquoteOverallStatus {
  if (loading) {
    return 'checking';
  }
  if (results.some((result) => result.verdict === 'unsafe')) {
    return 'unsafe';
  }
  if (
    results.length > 0 &&
    results.every((result) => result.verdict === 'safe')
  ) {
    return 'safe';
  }
  return 'not-recognised';
}

const STATUS_DISPLAY = {
  checking: {
    icon: IconName.SecuritySearch,
    iconColor: IconColor.IconAlternative,
    title: 'swissquoteCheckingTitle',
    description: 'swissquoteCheckingDescription',
  },
  safe: {
    icon: IconName.SecurityTick,
    iconColor: IconColor.SuccessDefault,
    title: 'swissquoteSafeTitle',
    description: 'swissquoteSafeDescription',
  },
  unsafe: {
    icon: IconName.Danger,
    iconColor: IconColor.ErrorDefault,
    title: 'swissquoteUnsafeTitle',
    description: 'swissquoteUnsafeDescription',
  },
  'not-recognised': {
    icon: IconName.Warning,
    iconColor: IconColor.WarningDefault,
    title: 'swissquoteNotRecognisedTitle',
    description: 'swissquoteNotRecognisedDescription',
  },
} as const;

const VERDICT_DISPLAY: Record<
  SwissquoteContractVerdict,
  { label: string; icon: IconName; color: TextColor; iconColor: IconColor }
> = {
  safe: {
    label: 'swissquoteVerdictSafe',
    icon: IconName.Confirmation,
    color: TextColor.SuccessDefault,
    iconColor: IconColor.SuccessDefault,
  },
  unsafe: {
    label: 'swissquoteVerdictUnsafe',
    icon: IconName.Danger,
    color: TextColor.ErrorDefault,
    iconColor: IconColor.ErrorDefault,
  },
  unknown: {
    label: 'swissquoteVerdictUnknown',
    icon: IconName.Question,
    color: TextColor.WarningDefault,
    iconColor: IconColor.WarningDefault,
  },
  'no-code': {
    label: 'swissquoteVerdictNoCode',
    icon: IconName.Question,
    color: TextColor.WarningDefault,
    iconColor: IconColor.WarningDefault,
  },
  error: {
    label: 'swissquoteVerdictError',
    icon: IconName.Warning,
    color: TextColor.WarningDefault,
    iconColor: IconColor.WarningDefault,
  },
};

type SwissquoteVerificationModalProps = Readonly<{
  /** The dApp origin the check is for. */
  origin: string;
  loading: boolean;
  results: SwissquoteContractCheckResult[];
  onContinue: () => void;
  onCancel: () => void;
}>;

/**
 * Popup with the result of the Swissquote contract code check: each contract
 * the dApp runs is hashed (SHA-256 of its bytecode) and compared against
 * Swissquote's database of safe and unsafe code.
 *
 * @param props - Component props.
 * @param props.origin - The dApp origin the check is for.
 * @param props.loading - Whether checks are still running.
 * @param props.results - The per-contract results.
 * @param props.onContinue - Called when the user proceeds.
 * @param props.onCancel - Called when the user closes or cancels.
 */
export function SwissquoteVerificationModal({
  origin,
  loading,
  results,
  onContinue,
  onCancel,
}: SwissquoteVerificationModalProps) {
  const t = useI18nContext();
  const status = getSwissquoteOverallStatus(loading, results);
  const display = STATUS_DISPLAY[status];

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
              name={display.icon}
              size={IconSize.Lg}
              color={display.iconColor}
            />
            <Text
              variant={TextVariant.HeadingMd}
              data-testid="swissquote-verification-status"
            >
              {t(display.title)}
            </Text>
          </Box>
          <Text
            variant={TextVariant.BodyMd}
            color={TextColor.TextAlternative}
            textAlign={TextAlign.Center}
          >
            {t(display.description)}
          </Text>
        </Box>

        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={2}
          paddingLeft={4}
          paddingRight={4}
          paddingBottom={4}
        >
          <Box
            flexDirection={BoxFlexDirection.Column}
            padding={3}
            className="rounded-lg bg-section"
          >
            <Text
              variant={TextVariant.BodySm}
              color={TextColor.TextAlternative}
            >
              {t('swissquoteCheckSite')}
            </Text>
            <Text
              variant={TextVariant.BodyMd}
              fontWeight={FontWeight.Medium}
              className="truncate"
            >
              {origin}
            </Text>
            {results.length === 0 && (
              <Text
                variant={TextVariant.BodySm}
                color={TextColor.WarningDefault}
              >
                {t('swissquoteNoContractsOnRecord')}
              </Text>
            )}
          </Box>

          {results.map((result) => {
            const verdict = result.verdict
              ? VERDICT_DISPLAY[result.verdict]
              : undefined;
            return (
              <Box
                key={`${result.chainId ?? result.networkClientId}:${result.address}`}
                flexDirection={BoxFlexDirection.Row}
                alignItems={BoxAlignItems.Center}
                justifyContent={BoxJustifyContent.Between}
                gap={3}
                padding={3}
                className="rounded-lg bg-section"
                data-testid="swissquote-contract-row"
              >
                <Box
                  flexDirection={BoxFlexDirection.Column}
                  className="min-w-0"
                >
                  <Text
                    variant={TextVariant.BodySm}
                    color={TextColor.TextAlternative}
                    className="truncate"
                  >
                    {result.label ?? t('swissquoteCheckContract')}
                  </Text>
                  <Text
                    variant={TextVariant.BodyMd}
                    fontWeight={FontWeight.Medium}
                  >
                    {shortenAddress(result.address)}
                  </Text>
                  {result.codeHash && (
                    <Text
                      variant={TextVariant.BodyXs}
                      color={TextColor.TextAlternative}
                      className="truncate font-mono"
                    >
                      {t('swissquoteCodeHash')} {result.codeHash.slice(0, 10)}…
                      {result.codeHash.slice(-6)}
                    </Text>
                  )}
                </Box>
                {verdict ? (
                  <Box
                    flexDirection={BoxFlexDirection.Row}
                    alignItems={BoxAlignItems.Center}
                    gap={1}
                    className="shrink-0"
                  >
                    <Icon
                      name={verdict.icon}
                      size={IconSize.Sm}
                      color={verdict.iconColor}
                    />
                    <Text
                      variant={TextVariant.BodySm}
                      fontWeight={FontWeight.Medium}
                      color={verdict.color}
                    >
                      {t(verdict.label)}
                    </Text>
                  </Box>
                ) : (
                  <Text
                    variant={TextVariant.BodySm}
                    color={TextColor.TextAlternative}
                    className="shrink-0"
                  >
                    {t('swissquoteVerdictChecking')}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>

        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={3}
          paddingLeft={4}
          paddingRight={4}
          paddingBottom={4}
        >
          <Text
            variant={TextVariant.BodyXs}
            color={TextColor.TextAlternative}
            textAlign={TextAlign.Center}
            data-testid="swissquote-verification-disclaimer"
          >
            {t('swissquoteVerificationDisclaimer')}
          </Text>
          <Button
            variant={ButtonVariant.Primary}
            size={ButtonSize.Lg}
            className="w-full"
            onClick={onContinue}
            isDanger={status === 'unsafe'}
            data-testid="swissquote-verification-continue"
          >
            {status === 'safe' ? t('continue') : t('swissquoteContinueAnyway')}
          </Button>
          {status !== 'safe' && (
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
