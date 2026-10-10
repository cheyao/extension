import { useSelector } from 'react-redux';
import { getCurrentKeyring } from '../../../../shared/lib/selectors/keyring';
import { FirstTimeFlowType } from '../../../../shared/constants/onboarding';
import {
  getFirstTimeFlowType,
  getFirstTimeFlowTypeRouteAfterMetaMetricsOptIn,
} from '../../../selectors';
import {
  ONBOARDING_COMPLETION_ROUTE,
  ONBOARDING_WELCOME_ROUTE,
} from '../../../helpers/constants/routes';
import { useIsFirefox } from '../../../hooks/useIsFirefox';

/**
 * Resolves the route the user continues to once the MetaMetrics opt-in step is
 * done. Every onboarding flow type continues somewhere different, and Firefox
 * additionally bounces back through the welcome step.
 *
 * Shared by the opt-in page and by the redirect that replaces it so the two
 * cannot drift apart.
 *
 * @returns The route to navigate to after the opt-in step.
 */
export function useNextRouteAfterMetametricsOptIn(): string {
  const isFirefox = useIsFirefox();
  const firstTimeFlowType = useSelector(getFirstTimeFlowType);
  const currentKeyring = useSelector(getCurrentKeyring);
  const routeAfterOptIn = useSelector(
    getFirstTimeFlowTypeRouteAfterMetaMetricsOptIn,
  );

  if (isFirefox && firstTimeFlowType !== FirstTimeFlowType.restore) {
    if (
      currentKeyring &&
      firstTimeFlowType === FirstTimeFlowType.socialCreate
    ) {
      return ONBOARDING_COMPLETION_ROUTE;
    }
    return ONBOARDING_WELCOME_ROUTE;
  }

  return routeAfterOptIn;
}