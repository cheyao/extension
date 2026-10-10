import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import log from 'loglevel';

import { BannerAlert, BannerAlertSeverity } from '../../component-library';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { submitRequestToBackground } from '../../../store/background-connection';
import type { RemoteControlAccessRequest } from '../../../../shared/types/remote-control';

/** How often to ask the background to re-check while the wallet is open. */
const REFRESH_INTERVAL_MS = 15_000;

type BlockStatus =
  | { state: 'idle' }
  | { state: 'blocking' }
  | { state: 'blocked' }
  | { state: 'failed'; reason: string };

type MetamaskState = {
  metamask: {
    remoteControlAccessRequests?: Record<string, RemoteControlAccessRequest>;
  };
};

const selectAccessRequests = (state: MetamaskState) =>
  state.metamask.remoteControlAccessRequests;

/**
 * Formats a duration in seconds as `m:ss`.
 *
 * @param seconds - The duration.
 * @returns The formatted duration.
 */
function formatDuration(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
}

/**
 * Warns that someone used the recovery keys to request control of one of the
 * user's accounts, and lets the user block it. Shown on the home screen for as
 * long as the request is pending or active.
 */
export default function RemoteControlAccessAlert() {
  const t = useI18nContext();
  const requests = useSelector(selectAccessRequests);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [statuses, setStatuses] = useState<Record<string, BlockStatus>>({});

  // Refresh from the chain while the wallet is open, rather than waiting for
  // the background alarm.
  useEffect(() => {
    const check = () =>
      submitRequestToBackground('messengerCall', [
        'RemoteControlController:checkAccessRequests',
        [],
      ]).catch((error) => log.warn('Checking unlock requests failed', error));
    check();
    const interval = setInterval(check, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const hasRequests = Boolean(requests && Object.keys(requests).length);
  useEffect(() => {
    if (!hasRequests) {
      return undefined;
    }
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, [hasRequests]);

  const block = useCallback(async (account: string) => {
    setStatuses((current) => ({
      ...current,
      [account]: { state: 'blocking' },
    }));
    try {
      await submitRequestToBackground('messengerCall', [
        'RemoteControlController:blockAccessRequest',
        [account],
      ]);
      setStatuses((current) => ({
        ...current,
        [account]: { state: 'blocked' },
      }));
    } catch (error) {
      log.error('Blocking unlock request failed', error);
      setStatuses((current) => ({
        ...current,
        [account]: {
          state: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }, []);

  if (!requests) {
    return null;
  }

  const visible = Object.values(requests).filter(
    (request) => now < request.expiresAt,
  );

  return (
    <>
      {visible.map((request) => {
        const status = statuses[request.account] ?? { state: 'idle' };
        const isActive = now >= request.unlockTime;
        const description = isActive
          ? t('remoteControlAccessActive', [
              request.controller,
              new Date(request.expiresAt * 1000).toLocaleTimeString(),
            ])
          : t('remoteControlAccessPending', [
              request.controller,
              formatDuration(request.unlockTime - now),
            ]);

        return (
          <BannerAlert
            key={`${request.account}:${request.unlockTime}`}
            data-testid="remote-control-access-alert"
            severity={BannerAlertSeverity.Danger}
            title={t('remoteControlAccessTitle')}
            margin={4}
            // The controller address is an unbroken hex string.
            style={{ overflowWrap: 'anywhere' }}
            actionButtonLabel={
              status.state === 'blocked'
                ? undefined
                : t(
                    status.state === 'blocking'
                      ? 'remoteControlAccessBlocking'
                      : 'remoteControlAccessBlock',
                  )
            }
            actionButtonProps={{
              disabled: status.state === 'blocking',
              'data-testid': 'remote-control-access-block',
            }}
            actionButtonOnClick={() => block(request.account)}
          >
            {description}
            {status.state === 'blocked' ? (
              <> {t('remoteControlAccessBlocked')}</>
            ) : null}
            {status.state === 'failed' ? (
              <span data-testid="remote-control-access-block-error">
                {' '}
                {t('remoteControlAccessBlockFailed', [status.reason])}
              </span>
            ) : null}
          </BannerAlert>
        );
      })}
    </>
  );
}
