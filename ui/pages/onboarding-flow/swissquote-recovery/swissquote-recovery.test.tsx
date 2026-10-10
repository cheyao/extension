import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { renderWithProvider } from '../../../../test/lib/render-helpers-navigate';

import { ONBOARDING_WELCOME_ROUTE } from '../../../helpers/constants/routes';
import { recoverWallet } from '../../../../shared/lib/remote-control/recover-wallet';
import SwissquoteRecovery from './swissquote-recovery';

jest.mock('../../../../shared/lib/remote-control/recover-wallet', () => ({
  ...jest.requireActual('../../../../shared/lib/remote-control/recover-wallet'),
  recoverWallet: jest.fn(),
}));

const mockRecoverWallet = jest.mocked(recoverWallet);
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '' }),
}));

const KEY_1 = `0x${'a1'.repeat(32)}`;
const KEY_2 = `0x${'b2'.repeat(32)}`;
const CONTROLLER = '0x1111111111111111111111111111111111111111';
const CONTROLLER_PK = `0x${'c3'.repeat(32)}`;
const DESTINATION = '0x2222222222222222222222222222222222222222';

const mockStore = configureMockStore([thunk]);

const renderPage = () =>
  renderWithProvider(
    <SwissquoteRecovery />,
    mockStore({ appState: { isInitialized: true }, metamask: {} }),
    '/',
    render,
  );

const fillForm = (getByTestId: (id: string) => HTMLElement) => {
  fireEvent.change(getByTestId('swissquote-recovery-key-1-input'), {
    target: { value: KEY_1 },
  });
  fireEvent.change(getByTestId('swissquote-recovery-key-2-input'), {
    target: { value: KEY_2 },
  });
  fireEvent.change(getByTestId('swissquote-recovery-controller-input'), {
    target: { value: CONTROLLER },
  });
  fireEvent.change(getByTestId('swissquote-recovery-controller-key-input'), {
    target: { value: CONTROLLER_PK },
  });
  fireEvent.change(getByTestId('swissquote-recovery-destination-input'), {
    target: { value: DESTINATION },
  });
};

describe('SwissquoteRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the start button disabled until every field is filled', () => {
    const { getByTestId } = renderPage();

    expect(getByTestId('swissquote-recovery-start')).toBeDisabled();

    fillForm(getByTestId);

    expect(getByTestId('swissquote-recovery-start')).toBeEnabled();
  });

  it('passes the entered inputs to recoverWallet', async () => {
    mockRecoverWallet.mockResolvedValue({
      transferred: [],
      skipped: [],
      reserveLeft: '0',
    });

    const { getByTestId } = renderPage();
    fillForm(getByTestId);
    fireEvent.click(getByTestId('swissquote-recovery-start'));

    await waitFor(() => {
      expect(mockRecoverWallet).toHaveBeenCalledWith(
        {
          recoveryKey1: KEY_1,
          recoveryKey2: KEY_2,
          controller: CONTROLLER,
          controllerPrivateKey: CONTROLLER_PK,
          destination: DESTINATION,
        },
        expect.objectContaining({ onProgress: expect.any(Function) }),
      );
    });
  });

  it('lists the transferred assets when recovery succeeds', async () => {
    mockRecoverWallet.mockResolvedValue({
      transferTransactionHash: `0x${'ee'.repeat(32)}`,
      transferred: [
        { token: 'native', symbol: 'MON', amount: '1.5' },
        {
          token: '0x3333333333333333333333333333333333333333',
          symbol: 'USDC',
          amount: '42',
        },
      ],
      skipped: [],
      reserveLeft: '10',
    });

    const { getByTestId } = renderPage();
    fillForm(getByTestId);
    fireEvent.click(getByTestId('swissquote-recovery-start'));

    await waitFor(() => {
      expect(getByTestId('swissquote-recovery-done')).toBeInTheDocument();
    });

    expect(
      getByTestId('swissquote-recovery-transferred-native'),
    ).toHaveTextContent('1.5 MON');
    expect(getByTestId('swissquote-recovery-tx')).toHaveTextContent('0xee');
  });

  it('shows the error message when recovery throws', async () => {
    mockRecoverWallet.mockRejectedValue(
      new Error('The request was cancelled or revoked by the wallet owner.'),
    );

    const { getByTestId } = renderPage();
    fillForm(getByTestId);
    fireEvent.click(getByTestId('swissquote-recovery-start'));

    await waitFor(() => {
      expect(getByTestId('swissquote-recovery-error')).toBeInTheDocument();
    });

    expect(getByTestId('swissquote-recovery-error-detail')).toHaveTextContent(
      'cancelled or revoked',
    );
  });

  it('navigates back to welcome from the form', () => {
    const { getByTestId } = renderPage();

    fireEvent.click(getByTestId('swissquote-recovery-back'));

    expect(mockNavigate).toHaveBeenCalledWith(ONBOARDING_WELCOME_ROUTE);
  });
});
