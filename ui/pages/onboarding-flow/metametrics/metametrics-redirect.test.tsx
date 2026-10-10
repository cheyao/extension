import React from 'react';
import { useLocation } from 'react-router-dom';
import { waitFor } from '@testing-library/react';
import configureMockStore from 'redux-mock-store';
import { renderWithProvider } from '../../../../test/lib/render-helpers-navigate';
import {
  ONBOARDING_COMPLETION_ROUTE,
  ONBOARDING_REVIEW_SRP_ROUTE,
  ONBOARDING_WELCOME_ROUTE,
} from '../../../helpers/constants/routes';
import { FirstTimeFlowType } from '../../../../shared/constants/onboarding';
import { setPna25Acknowledged } from '../../../store/actions';
import MetaMetricsRedirect from './metametrics-redirect';

jest.mock('../../../hooks/useIsFirefox', () => ({
  useIsFirefox: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../store/actions', () => ({
  setPna25Acknowledged: jest.fn(() => () => Promise.resolve()),
  setParticipateInMetaMetrics: jest.fn(() => () => Promise.resolve()),
  setDataCollectionForMarketing: jest.fn(() => () => Promise.resolve()),
}));

const { useIsFirefox } = jest.requireMock('../../../hooks/useIsFirefox');

type LocationCaptureProps = {
  onLocationChange: (path: string) => void;
};

// Test component to capture the route the redirect lands on.
// TODO: Fix in https://github.com/MetaMask/metamask-extension/issues/31860
// eslint-disable-next-line @typescript-eslint/naming-convention
function LocationCapture({ onLocationChange }: LocationCaptureProps) {
  const location = useLocation();
  React.useEffect(() => {
    onLocationChange(location.pathname);
  }, [location.pathname, onLocationChange]);
  return null;
}

describe('MetaMetricsRedirect', () => {
  let currentPath: string;

  const renderRedirect = (state: Record<string, unknown>) => {
    const mockStore = configureMockStore()({
      metamask: {
        internalAccounts: {
          accounts: {},
          selectedAccount: '',
        },
        ...state,
      },
    });

    renderWithProvider(
      <>
        <MetaMetricsRedirect />
        <LocationCapture
          onLocationChange={(path) => {
            currentPath = path;
          }}
        />
      </>,
      mockStore,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useIsFirefox).mockReturnValue(false);
  });

  describe('routing', () => {
    it('redirects to the completion route for the create flow', () => {
      renderRedirect({ firstTimeFlowType: FirstTimeFlowType.create });

      expect(currentPath).toStrictEqual(ONBOARDING_COMPLETION_ROUTE);
    });

    it('redirects to the review recovery phrase route for the restore flow', () => {
      renderRedirect({ firstTimeFlowType: FirstTimeFlowType.restore });

      expect(currentPath).toStrictEqual(ONBOARDING_REVIEW_SRP_ROUTE);
    });

    it('redirects to the welcome route on Firefox', () => {
      jest.mocked(useIsFirefox).mockReturnValue(true);

      renderRedirect({ firstTimeFlowType: FirstTimeFlowType.create });

      expect(currentPath).toStrictEqual(ONBOARDING_WELCOME_ROUTE);
    });
  });

  describe('side effects', () => {
    it('acknowledges the updated privacy notice so its modal stays suppressed', async () => {
      renderRedirect({ firstTimeFlowType: FirstTimeFlowType.create });

      await waitFor(() => {
        expect(setPna25Acknowledged).toHaveBeenCalledWith(true, true);
      });
    });

    it('leaves MetaMetrics participation unset so tracking stays off', async () => {
      const { setParticipateInMetaMetrics } = jest.requireMock(
        '../../../store/actions',
      );

      renderRedirect({ firstTimeFlowType: FirstTimeFlowType.create });

      await waitFor(() => {
        expect(setPna25Acknowledged).toHaveBeenCalled();
      });
      expect(setParticipateInMetaMetrics).not.toHaveBeenCalled();
    });
  });
});