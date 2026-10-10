import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  BoxAlignItems,
  BoxBackgroundColor,
  BoxFlexDirection,
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
import log from 'loglevel';

import {
  FormTextField,
  TextFieldType,
} from '../../../components/component-library';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { ONBOARDING_WELCOME_ROUTE } from '../../../helpers/constants/routes';
import {
  recoverWallet,
  RecoveryError,
  type RecoveryProgress,
  type RecoveryResult,
} from '../../../../shared/lib/remote-control/recover-wallet';

const LOG_TAG = '[SwissquoteRecovery]';

type Status = 'idle' | 'running' | 'done' | 'error';

type FormState = {
  recoveryKey1: string;
  recoveryKey2: string;
  controller: string;
  controllerPrivateKey: string;
  destination: string;
};

const EMPTY_FORM: FormState = {
  recoveryKey1: '',
  recoveryKey2: '',
  controller: '',
  controllerPrivateKey: '',
  destination: '',
};

/**
 * Onboarding entry point for the Swissquote recovery flow.
 *
 * Collects the same inputs as the `recovery-kit` `unlock` script — two of the
 * three recovery keys, the controller and its private key, and the wallet to
 * recover — then runs the full recovery in-page: it requests access, waits out
 * the delegate's cooldown (during which the wallet owner is alerted and can
 * cancel or revoke), and transfers every balance it finds to the controller.
 *
 * The private keys entered here are only used to sign locally; they are never
 * persisted or sent anywhere.
 */
export default function SwissquoteRecovery() {
  const navigate = useNavigate();
  const t = useI18nContext();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<RecoveryProgress | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const setField = useCallback(
    (field: keyof FormState) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setForm((previous) => ({ ...previous, [field]: value }));
      },
    [],
  );

  const isComplete = Object.values(form).every(
    (value) => value.trim().length > 0,
  );

  const handleRecover = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('running');
    setProgress({ step: 'checking' });
    setResult(null);
    setErrorMessage(null);

    try {
      const recovery = await recoverWallet(form, {
        signal: controller.signal,
        onProgress: (next) => {
          if (isMountedRef.current) {
            setProgress(next);
          }
        },
      });
      if (!isMountedRef.current) {
        return;
      }
      setResult(recovery);
      setStatus('done');
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      log.error(`${LOG_TAG} recovery failed`, error);
      setErrorMessage(
        error instanceof RecoveryError || error instanceof Error
          ? error.message
          : String(error),
      );
      setStatus('error');
    }
  }, [form]);

  const progressMessage = (): string => {
    if (!progress) {
      return t('swissquoteRecoveryProgressChecking');
    }
    switch (progress.step) {
      case 'checking':
        return t('swissquoteRecoveryProgressChecking');
      case 'requesting':
        return t('swissquoteRecoveryProgressRequesting');
      case 'waiting':
        return t('swissquoteRecoveryProgressWaiting', [
          String(progress.secondsLeft),
        ]);
      case 'finding-tokens':
        return t('swissquoteRecoveryProgressFindingTokens');
      case 'transferring':
        return t('swissquoteRecoveryProgressTransferring', [
          String(progress.assetCount),
        ]);
      default:
        return t('swissquoteRecoveryProgressChecking');
    }
  };

  const renderForm = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="swissquote-recovery-form"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('swissquoteRecoveryTitle')}
      </Text>
      <Text variant={TextVariant.BodyMd} color={TextColor.TextAlternative}>
        {t('swissquoteRecoveryBody')}
      </Text>

      <FormTextField
        id="swissquote-recovery-key-1"
        label={t('swissquoteRecoveryKey1Label')}
        placeholder="0x…"
        type={TextFieldType.Password}
        value={form.recoveryKey1}
        onChange={setField('recoveryKey1')}
        inputProps={{ 'data-testid': 'swissquote-recovery-key-1-input' }}
      />
      <FormTextField
        id="swissquote-recovery-key-2"
        label={t('swissquoteRecoveryKey2Label')}
        placeholder="0x…"
        type={TextFieldType.Password}
        value={form.recoveryKey2}
        onChange={setField('recoveryKey2')}
        inputProps={{ 'data-testid': 'swissquote-recovery-key-2-input' }}
      />
      <FormTextField
        id="swissquote-recovery-controller"
        label={t('swissquoteRecoveryControllerLabel')}
        placeholder="0x…"
        value={form.controller}
        onChange={setField('controller')}
        inputProps={{ 'data-testid': 'swissquote-recovery-controller-input' }}
      />
      <FormTextField
        id="swissquote-recovery-controller-key"
        label={t('swissquoteRecoveryControllerKeyLabel')}
        helpText={t('swissquoteRecoveryControllerKeyHelp')}
        placeholder="0x…"
        type={TextFieldType.Password}
        value={form.controllerPrivateKey}
        onChange={setField('controllerPrivateKey')}
        inputProps={{
          'data-testid': 'swissquote-recovery-controller-key-input',
        }}
      />
      <FormTextField
        id="swissquote-recovery-destination"
        label={t('swissquoteRecoveryDestinationLabel')}
        placeholder="0x…"
        value={form.destination}
        onChange={setField('destination')}
        inputProps={{ 'data-testid': 'swissquote-recovery-destination-input' }}
      />

      <Box
        flexDirection={BoxFlexDirection.Row}
        gap={2}
        alignItems={BoxAlignItems.Center}
      >
        <Icon
          name={IconName.Info}
          color={IconColor.IconAlternative}
          size={IconSize.Md}
        />
        <Text variant={TextVariant.BodySm} color={TextColor.TextAlternative}>
          {t('swissquoteRecoveryCooldownNotice')}
        </Text>
      </Box>

      <Button
        variant={ButtonVariant.Primary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="swissquote-recovery-start"
        isDisabled={!isComplete}
        onClick={handleRecover}
      >
        {t('swissquoteRecoveryStart')}
      </Button>
      <Button
        variant={ButtonVariant.Secondary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="swissquote-recovery-back"
        onClick={() => navigate(ONBOARDING_WELCOME_ROUTE)}
      >
        {t('swissquoteRecoveryBack')}
      </Button>
    </Box>
  );

  const renderRunning = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="swissquote-recovery-running"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('swissquoteRecoveryRunningTitle')}
      </Text>
      <Text
        variant={TextVariant.BodyMd}
        color={TextColor.TextAlternative}
        data-testid="swissquote-recovery-progress"
      >
        {progressMessage()}
      </Text>
    </Box>
  );

  const renderDone = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="swissquote-recovery-done"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('swissquoteRecoveryDoneTitle')}
      </Text>
      {result && result.transferred.length > 0 ? (
        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={2}
          backgroundColor={BoxBackgroundColor.SuccessMuted}
          padding={4}
        >
          <Text
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            color={TextColor.SuccessDefault}
          >
            {t('swissquoteRecoveryTransferredLabel')}
          </Text>
          {result.transferred.map((asset) => (
            <Text
              key={asset.token}
              variant={TextVariant.BodySm}
              data-testid={`swissquote-recovery-transferred-${asset.token}`}
            >
              {asset.amount} {asset.symbol}
            </Text>
          ))}
        </Box>
      ) : (
        <Text variant={TextVariant.BodyMd} color={TextColor.TextAlternative}>
          {t('swissquoteRecoveryNothingTransferred')}
        </Text>
      )}

      {result && result.skipped.length > 0 ? (
        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={2}
          backgroundColor={BoxBackgroundColor.WarningMuted}
          padding={4}
          data-testid="swissquote-recovery-skipped"
        >
          <Text
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            color={TextColor.WarningDefault}
          >
            {t('swissquoteRecoverySkippedLabel')}
          </Text>
          {result.skipped.map((asset) => (
            <Text key={asset.token} variant={TextVariant.BodySm}>
              {asset.amount} {asset.symbol}
            </Text>
          ))}
        </Box>
      ) : null}

      {result?.transferTransactionHash ? (
        <Box flexDirection={BoxFlexDirection.Column} gap={1}>
          <Text variant={TextVariant.BodySm} color={TextColor.TextMuted}>
            {t('swissquoteRecoveryTxLabel')}
          </Text>
          <Text
            variant={TextVariant.BodySm}
            data-testid="swissquote-recovery-tx"
            className="swissquote-recovery__key"
          >
            {result.transferTransactionHash}
          </Text>
        </Box>
      ) : null}

      <Button
        variant={ButtonVariant.Primary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="swissquote-recovery-finish"
        onClick={() => navigate(ONBOARDING_WELCOME_ROUTE)}
      >
        {t('swissquoteRecoveryFinish')}
      </Button>
    </Box>
  );

  const renderError = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="swissquote-recovery-error"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('swissquoteRecoveryErrorTitle')}
      </Text>
      {errorMessage ? (
        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={1}
          backgroundColor={BoxBackgroundColor.ErrorMuted}
          padding={4}
        >
          <Text
            variant={TextVariant.BodySm}
            color={TextColor.ErrorDefault}
            data-testid="swissquote-recovery-error-detail"
          >
            {errorMessage}
          </Text>
        </Box>
      ) : null}
      <Button
        variant={ButtonVariant.Primary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="swissquote-recovery-retry"
        onClick={() => {
          setStatus('idle');
          setProgress(null);
          setErrorMessage(null);
        }}
      >
        {t('swissquoteRecoveryTryAgain')}
      </Button>
    </Box>
  );

  return (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={6}
      className="swissquote-recovery h-full"
      data-testid="swissquote-recovery-page"
    >
      {status === 'idle' ? renderForm() : null}
      {status === 'running' ? renderRunning() : null}
      {status === 'done' ? renderDone() : null}
      {status === 'error' ? renderError() : null}
    </Box>
  );
}
