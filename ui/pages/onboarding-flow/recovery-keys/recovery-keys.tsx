import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Box,
  BoxAlignItems,
  BoxBackgroundColor,
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
import log from 'loglevel';

import { useI18nContext } from '../../../hooks/useI18nContext';
import { submitRequestToBackground } from '../../../store/background-connection';
import type { RemoteControlDeployment } from '../../../../shared/types/remote-control';
import {
  ONBOARDING_COMPLETION_ROUTE,
  ONBOARDING_METAMETRICS,
} from '../../../helpers/constants/routes';
import { getFirstTimeFlowType } from '../../../selectors/first-time-flow';
import { FirstTimeFlowType } from '../../../../shared/constants/onboarding';
import { useIsFirefox } from '../../../hooks/useIsFirefox';
import { useOnboardingSearchParams } from '../hooks/useOnboardingSearchParams';

const LOG_TAG = '[RecoveryKeys]';

type Status = 'idle' | 'deploying' | 'success' | 'error' | 'unavailable';

/**
 * Post-SRP-verification step that deploys the remote-control delegate and
 * reveals the three recovery keys it bakes in.
 *
 * Onboarding routes through here unconditionally, so this step distinguishes
 * three outcomes that must never be conflated:
 *
 * - Not applicable (imported wallet, Firefox, reminder flow): redirect onward.
 * - Genuinely not built with an endpoint: redirect onward, because there is no
 * custody feature to offer.
 * - Built with an endpoint but the deployment failed: show the error. Silently
 * skipping here would leave a wallet with no recovery custody and no
 * explanation, which is the one outcome worth shouting about.
 */
export default function RecoveryKeys() {
  const navigate = useNavigate();
  const t = useI18nContext();
  const firstTimeFlowType = useSelector(getFirstTimeFlowType);
  const isFirefox = useIsFirefox();
  const { isFromReminder, nextRouteQueryString } = useOnboardingSearchParams();

  const [status, setStatus] = useState<Status>('idle');
  const [deployment, setDeployment] = useState<RemoteControlDeployment | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasConfirmedSaved, setHasConfirmedSaved] = useState(false);

  // Guards against a second deploy if the effect re-runs (React 18 strict mode
  // double-invokes effects in development).
  const hasStartedRef = useRef(false);

  // Tracks mounting separately from the deploy effect. A per-run cancelled
  // flag would be set by strict mode's simulated unmount, and since the
  // remount does not start a second deploy, the result of the only deploy
  // would then be dropped and the page would never leave "deploying".
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const nextRoute = isFirefox
    ? ONBOARDING_COMPLETION_ROUTE
    : ONBOARDING_METAMETRICS;

  const goToNextRoute = useCallback(() => {
    navigate(
      `${nextRoute}${nextRouteQueryString ? `?${nextRouteQueryString}` : ''}`,
      { replace: true },
    );
  }, [navigate, nextRoute, nextRouteQueryString]);

  /**
   * Whether this wallet should get a delegate. Imported and restored wallets
   * are excluded: only a freshly created vault gets one.
   */
  const shouldDeploy =
    !isFromReminder &&
    firstTimeFlowType === FirstTimeFlowType.create &&
    !isFirefox;

  useEffect(() => {
    // An unconfigured build has no custody feature to offer, so move on rather
    // than showing an error about a build the user did not choose.
    if (status === 'unavailable') {
      goToNextRoute();
    }
  }, [goToNextRoute, status]);

  useEffect(() => {
    if (!shouldDeploy) {
      goToNextRoute();
      return undefined;
    }

    if (hasStartedRef.current) {
      return undefined;
    }
    hasStartedRef.current = true;

    const run = async () => {
      setStatus('deploying');
      try {
        // Only a genuinely unconfigured build skips. Anything else that fails
        // is a real deployment failure and must be shown rather than
        // swallowed, or a wallet ends up with no custody and no explanation.
        const availability = await submitRequestToBackground<{
          isConfigured: boolean;
        }>('messengerCall', [
          'RemoteControlController:isRemoteControlAvailable',
          [],
        ]);

        if (!availability?.isConfigured) {
          log.warn(`${LOG_TAG} no gas station configured; skipping`);
          if (isMountedRef.current) {
            setStatus('unavailable');
          }
          return;
        }

        const result = await submitRequestToBackground<RemoteControlDeployment>(
          'messengerCall',
          ['RemoteControlController:deployRemoteControlDelegate', []],
        );

        if (!isMountedRef.current) {
          return;
        }
        setDeployment(result);
        setStatus('success');
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        log.error(`${LOG_TAG} deployment failed`, error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t('recoveryKeysGenericError'),
        );
        setStatus('error');
      }
    };

    // Intentionally not awaited: the component's own status state drives the
    // UI, and an unhandled rejection here would surface as a global error
    // rather than the inline error state.
    run().catch(() => undefined);

    return undefined;
    // Deliberately excludes `status`: this effect owns the status transitions.
  }, [goToNextRoute, shouldDeploy, t]);

  const renderDeploying = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="recovery-keys-deploying"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('recoveryKeysDeployingTitle')}
      </Text>
      <Text variant={TextVariant.BodyMd} color={TextColor.TextAlternative}>
        {t('recoveryKeysDeployingBody')}
      </Text>
    </Box>
  );

  const renderError = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="recovery-keys-error"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('recoveryKeysErrorTitle')}
      </Text>
      <Text variant={TextVariant.BodyMd} color={TextColor.TextAlternative}>
        {t('recoveryKeysErrorBody')}
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
            fontWeight={FontWeight.Medium}
            color={TextColor.ErrorDefault}
          >
            {t('recoveryKeysErrorReasonLabel')}
          </Text>
          <Text
            variant={TextVariant.BodySm}
            className="recovery-keys__key"
            data-testid="recovery-keys-error-detail"
          >
            {errorMessage}
          </Text>
        </Box>
      ) : null}
      <Button
        variant={ButtonVariant.Primary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="recovery-keys-skip"
        onClick={goToNextRoute}
      >
        {t('recoveryKeysContinue')}
      </Button>
    </Box>
  );

  const renderKeys = () => (
    <Box
      flexDirection={BoxFlexDirection.Column}
      gap={4}
      data-testid="recovery-keys-success"
    >
      <Text variant={TextVariant.HeadingMd} fontWeight={FontWeight.Medium}>
        {t('recoveryKeysTitle')}
      </Text>
      <Text variant={TextVariant.BodyMd} color={TextColor.TextAlternative}>
        {t('recoveryKeysBody', [deployment?.delegateAddress ?? ''])}
      </Text>

      {deployment?.isCodeConfirmed && !deployment.isDelegated ? (
        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={1}
          backgroundColor={BoxBackgroundColor.WarningMuted}
          padding={4}
          data-testid="recovery-keys-not-delegated"
        >
          <Text
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            color={TextColor.WarningDefault}
          >
            {t('recoveryKeysNotDelegated')}
          </Text>
          {deployment.delegationError ? (
            <Text variant={TextVariant.BodySm} className="recovery-keys__key">
              {deployment.delegationError}
            </Text>
          ) : null}
        </Box>
      ) : null}

      {deployment && !deployment.isCodeConfirmed ? (
        <Box
          flexDirection={BoxFlexDirection.Row}
          gap={2}
          alignItems={BoxAlignItems.Center}
          data-testid="recovery-keys-unconfirmed"
        >
          <Icon
            name={IconName.Warning}
            color={IconColor.Warning}
            size={IconSize.Md}
          />
          <Text variant={TextVariant.BodySm} color={TextColor.WarningDefault}>
            {t('recoveryKeysUnconfirmed')}
          </Text>
        </Box>
      ) : null}

      {deployment ? (
        <Box
          flexDirection={BoxFlexDirection.Column}
          gap={1}
          data-testid="recovery-keys-tx"
        >
          <Text variant={TextVariant.BodySm} color={TextColor.TextMuted}>
            {t('recoveryKeysTxLabel')}
          </Text>
          <Text variant={TextVariant.BodySm} className="recovery-keys__key">
            {deployment.transactionHash}
          </Text>
        </Box>
      ) : null}

      <Box
        flexDirection={BoxFlexDirection.Column}
        gap={2}
        backgroundColor={BoxBackgroundColor.InfoMuted}
        padding={4}
      >
        {deployment?.keys.map((key, index) =>
          index === 2 ? null : (
            <Box key={key.label} data-testid={`recovery-key-${key.label}`}>
              <Text variant={TextVariant.BodySm} color={TextColor.TextMuted}>
                {t(`recoveryKeyLabel${key.label}`)}
              </Text>
              <Text variant={TextVariant.BodyMd} className="recovery-keys__key">
                {key.privateKey}
              </Text>
            </Box>
          ),
        )}
      </Box>

      <Box
        flexDirection={BoxFlexDirection.Row}
        gap={2}
        alignItems={BoxAlignItems.Center}
      >
        <Icon
          name={IconName.Warning}
          color={IconColor.Warning}
          size={IconSize.Md}
        />
        <Text variant={TextVariant.BodySm} color={TextColor.TextAlternative}>
          {t('recoveryKeysNeverAgain')}
        </Text>
      </Box>

      <Button
        variant={ButtonVariant.Secondary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="recovery-keys-acknowledge"
        onClick={() => setHasConfirmedSaved((value) => !value)}
      >
        {t('recoveryKeysAcknowledge')}
      </Button>

      <Button
        variant={ButtonVariant.Primary}
        size={ButtonSize.Lg}
        className="w-full"
        data-testid="recovery-keys-continue"
        disabled={!hasConfirmedSaved}
        onClick={goToNextRoute}
      >
        {t('recoveryKeysContinue')}
      </Button>
    </Box>
  );

  return (
    <Box
      flexDirection={BoxFlexDirection.Column}
      justifyContent={BoxJustifyContent.SpaceBetween}
      gap={6}
      className="recovery-keys h-full"
      data-testid="recovery-keys-page"
    >
      {status === 'deploying' || status === 'idle' ? renderDeploying() : null}
      {status === 'error' ? renderError() : null}
      {status === 'success' ? renderKeys() : null}
    </Box>
  );
}
