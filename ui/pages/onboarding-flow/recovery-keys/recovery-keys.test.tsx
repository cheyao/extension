import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { renderWithProvider } from '../../../../test/lib/render-helpers-navigate';

import { FirstTimeFlowType } from '../../../../shared/constants/onboarding';
import {
  ONBOARDING_COMPLETION_ROUTE,
  ONBOARDING_METAMETRICS,
} from '../../../helpers/constants/routes';
import { submitRequestToBackground } from '../../../store/background-connection';
import RecoveryKeys from './recovery-keys';

jest.mock('../../../store/background-connection', () => ({
  ...jest.requireActual('../../../store/background-connection'),
  submitRequestToBackground: jest.fn(),
}));

const mockSubmitRequestToBackground = jest.mocked(submitRequestToBackground);
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '' }),
}));

const mockUseIsFirefox = jest.fn().mockReturnValue(false);
jest.mock('../../../hooks/useIsFirefox', () => ({
  useIsFirefox: () => mockUseIsFirefox(),
}));

const mockUseOnboardingSearchParams = jest.fn().mockReturnValue({
  isFromReminder: false,
  isFromSettingsSecurity: false,
  nextRouteQueryString: '',
});
jest.mock('../hooks/useOnboardingSearchParams', () => ({
  useOnboardingSearchParams: () => mockUseOnboardingSearchParams(),
}));

const KEY_A = `0x${'aa'.repeat(32)}`;
const KEY_B = `0x${'bb'.repeat(32)}`;
const KEY_C = `0x${'cc'.repeat(32)}`;

const DEPLOYMENT = {
  delegateAddress: '0x4444444444444444444444444444444444444444',
  transactionHash: `0x${'dd'.repeat(32)}`,
  isCodeConfirmed: true,
  isDelegated: true,
  keys: [
    { label: 'A', privateKey: KEY_A, address: `0x${'01'.repeat(20)}` },
    { label: 'B', privateKey: KEY_B, address: `0x${'02'.repeat(20)}` },
    { label: 'C', privateKey: KEY_C, address: `0x${'03'.repeat(20)}` },
  ],
};

const mockStore = configureMockStore([thunk]);

const getBaseState = (firstTimeFlowType = FirstTimeFlowType.create) => ({
  appState: { isInitialized: true },
  metamask: { firstTimeFlowType },
});

const renderRecoveryKeys = (state = getBaseState()) =>
  renderWithProvider(<RecoveryKeys />, mockStore(state), '/', render);

describe('RecoveryKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsFirefox.mockReturnValue(false);
    mockUseOnboardingSearchParams.mockReturnValue({
      isFromReminder: false,
      isFromSettingsSecurity: false,
      nextRouteQueryString: '',
    });
    mockSubmitRequestToBackground
      .mockResolvedValueOnce({ isConfigured: true })
      .mockResolvedValueOnce(DEPLOYMENT);
  });

  describe('when the wallet was imported rather than created', () => {
    it('redirects without deploying', async () => {
      renderRecoveryKeys(getBaseState(FirstTimeFlowType.import));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_METAMETRICS, {
          replace: true,
        });
      });
      expect(mockSubmitRequestToBackground).not.toHaveBeenCalled();
    });
  });

  describe('when the feature is not configured in this build', () => {
    it('redirects without showing keys or an error', async () => {
      mockSubmitRequestToBackground.mockReset();
      mockSubmitRequestToBackground.mockResolvedValueOnce({
        isConfigured: false,
      });

      const { queryByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_METAMETRICS, {
          replace: true,
        });
      });

      // A build with no endpoint has no custody feature to offer, so this is
      // the one case that should pass silently.
      expect(queryByTestId('recovery-keys-error')).not.toBeInTheDocument();
      expect(queryByTestId('recovery-keys-success')).not.toBeInTheDocument();
      expect(mockSubmitRequestToBackground).toHaveBeenCalledTimes(1);
    });

    it('never attempts a deployment', async () => {
      mockSubmitRequestToBackground.mockReset();
      mockSubmitRequestToBackground.mockResolvedValueOnce({
        isConfigured: false,
      });

      renderRecoveryKeys();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });

      expect(mockSubmitRequestToBackground).not.toHaveBeenCalledWith(
        'messengerCall',
        ['RemoteControlController:deployRemoteControlDelegate', []],
      );
    });
  });

  describe('when the deployment succeeds', () => {
    it('shows all three private keys', async () => {
      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-key-A')).toHaveTextContent(KEY_A);
      expect(getByTestId('recovery-key-B')).toHaveTextContent(KEY_B);
      expect(getByTestId('recovery-key-C')).toHaveTextContent(KEY_C);
    });

    it('shows the keys under strict mode, deploying only once', async () => {
      const { getByTestId } = renderWithProvider(
        <React.StrictMode>
          <RecoveryKeys />
        </React.StrictMode>,
        mockStore(getBaseState()),
        '/',
        render,
      );

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(
        mockSubmitRequestToBackground.mock.calls.filter(
          ([, [action]]) =>
            action === 'RemoteControlController:deployRemoteControlDelegate',
        ),
      ).toHaveLength(1);
    });

    it('does not warn when the contract code was confirmed', async () => {
      const { getByTestId, queryByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(
        queryByTestId('recovery-keys-unconfirmed'),
      ).not.toBeInTheDocument();
    });

    it('does not warn about delegation when the wallet was delegated', async () => {
      const { getByTestId, queryByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(
        queryByTestId('recovery-keys-not-delegated'),
      ).not.toBeInTheDocument();
    });

    it('shows the keys and why, when the wallet could not be delegated', async () => {
      mockSubmitRequestToBackground
        .mockReset()
        .mockResolvedValueOnce({ isConfigured: true })
        .mockResolvedValueOnce({
          ...DEPLOYMENT,
          isDelegated: false,
          delegationError:
            'Pimlico did not accept the sponsored transaction: x',
        });

      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-not-delegated')).toHaveTextContent(
        'Pimlico did not accept the sponsored transaction: x',
      );
      expect(getByTestId('recovery-key-A')).toHaveTextContent(KEY_A);
    });

    it('still shows the keys, with a warning, when the code is unconfirmed', async () => {
      mockSubmitRequestToBackground
        .mockReset()
        .mockResolvedValueOnce({ isConfigured: true })
        .mockResolvedValueOnce({ ...DEPLOYMENT, isCodeConfirmed: false });

      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-unconfirmed')).toBeInTheDocument();
      expect(getByTestId('recovery-key-A')).toHaveTextContent(KEY_A);
    });

    it('shows the delegate address', async () => {
      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-success')).toHaveTextContent(
        DEPLOYMENT.delegateAddress,
      );
    });

    it('gates continue behind acknowledging the keys were saved', async () => {
      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-continue')).toBeInTheDocument();
      });

      const continueButton = getByTestId('recovery-keys-continue');
      expect(continueButton).toBeDisabled();

      fireEvent.click(getByTestId('recovery-keys-acknowledge'));

      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });

      fireEvent.click(continueButton);
      expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_METAMETRICS, {
        replace: true,
      });
    });

    it('shows the deployment transaction for verification', async () => {
      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-tx')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-tx')).toHaveTextContent(
        DEPLOYMENT.transactionHash,
      );
    });

    it('warns that the keys are not stored', async () => {
      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-success')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-success')).toHaveTextContent(
        'These keys are shown only once and are not stored by the wallet. Write them down now.',
      );
    });
  });

  describe('when the deployment fails', () => {
    beforeEach(() => {
      mockSubmitRequestToBackground.mockReset();
      mockSubmitRequestToBackground
        .mockResolvedValueOnce({ isConfigured: true })
        .mockRejectedValueOnce(new Error('paymaster rejected the operation'));
    });

    it('shows an error the user can skip past', async () => {
      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-error')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-error-detail')).toHaveTextContent(
        'paymaster rejected the operation',
      );

      fireEvent.click(getByTestId('recovery-keys-skip'));

      expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_METAMETRICS, {
        replace: true,
      });
    });

    it('does not block onboarding', async () => {
      const { queryByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(queryByTestId('recovery-keys-error')).toBeInTheDocument();
      });

      expect(queryByTestId('recovery-keys-success')).not.toBeInTheDocument();
    });

    it('does not silently redirect past the failure', async () => {
      renderRecoveryKeys();

      await waitFor(() => {
        expect(screen.getByTestId('recovery-keys-error')).toBeInTheDocument();
      });

      // Regression guard: a failed deployment must never look like an
      // unconfigured build, or a wallet silently ends up with no custody.
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows a generic message when the error carries none', async () => {
      mockSubmitRequestToBackground.mockReset();
      mockSubmitRequestToBackground
        .mockResolvedValueOnce({ isConfigured: true })
        .mockRejectedValueOnce('a bare string rejection');

      const { getByTestId } = renderRecoveryKeys();

      await waitFor(() => {
        expect(getByTestId('recovery-keys-error')).toBeInTheDocument();
      });

      expect(getByTestId('recovery-keys-error-detail')).toHaveTextContent(
        'Recovery setup failed for an unknown reason.',
      );
    });
  });

  describe('when on Firefox', () => {
    it('redirects to the completion route', async () => {
      mockUseIsFirefox.mockReturnValue(true);

      renderRecoveryKeys();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_COMPLETION_ROUTE, {
          replace: true,
        });
      });
      expect(mockSubmitRequestToBackground).not.toHaveBeenCalled();
    });
  });

  describe('when arriving from the reminder flow', () => {
    it('redirects without deploying', async () => {
      mockUseOnboardingSearchParams.mockReturnValue({
        isFromReminder: true,
        isFromSettingsSecurity: false,
        nextRouteQueryString: '',
      });

      renderRecoveryKeys();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_METAMETRICS, {
          replace: true,
        });
      });
      expect(mockSubmitRequestToBackground).not.toHaveBeenCalled();
    });
  });
});
