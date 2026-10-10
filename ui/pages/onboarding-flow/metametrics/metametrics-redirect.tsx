import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import log from 'loglevel';
import { setPna25Acknowledged } from '../../../store/actions';
import { useDispatch } from '../../../store/hooks';
import { useNextRouteAfterMetametricsOptIn } from './use-next-route-after-metametrics-opt-in';

/**
 * Redirect stand-in for the "Help improve MetaMask" opt-in page.
 *
 * The page is no longer surfaced during onboarding, but the route stays
 * reachable so inbound links and stale history entries do not dead-end. The
 * user is sent straight to whichever route the opt-in page would have
 * continued to, and the updated privacy notice is acknowledged so its modal
 * does not surface after onboarding.
 *
 * Note this deliberately leaves MetaMetrics participation unset: skipping the
 * page is treated as declining to opt in, so tracking stays off until the user
 * turns it on from Settings.
 */
export default function MetaMetricsRedirect() {
  const dispatch = useDispatch();
  const nextRoute = useNextRouteAfterMetametricsOptIn();

  useEffect(() => {
    // Mirrors the opt-in page's Continue, which acknowledges the notice for
    // every user regardless of their choice.
    const acknowledgePrivacyNotice = async () => {
      try {
        await dispatch(setPna25Acknowledged(true, true));
      } catch (error) {
        // Don't block onboarding if the state update fails.
        log.error('Error setting pna25Acknowledged:', error);
      }
    };

    acknowledgePrivacyNotice();
  }, [dispatch]);

  return <Navigate to={nextRoute} replace />;
}