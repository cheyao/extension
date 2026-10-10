import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import configureMockStore from 'redux-mock-store';

import { renderWithProvider } from '../../../../test/lib/render-helpers-navigate';
import { submitRequestToBackground } from '../../../store/background-connection';
import RemoteControlAccessAlert from './remote-control-access-alert';

jest.mock('../../../store/background-connection', () => ({
  ...jest.requireActual('../../../store/background-connection'),
  submitRequestToBackground: jest.fn(),
}));

const mockSubmitRequestToBackground = jest.mocked(submitRequestToBackground);

const ACCOUNT = '0x5af0f461b6707b4510a3510be668c841cbf42130';
const CONTROLLER = '0xe49f06a43cb75c18b235efbc1dd8372fd36e538f';

const nowSeconds = () => Math.floor(Date.now() / 1000);

const renderAlert = (
  requests: Record<string, unknown> | undefined = undefined,
) =>
  renderWithProvider(
    <RemoteControlAccessAlert />,
    configureMockStore()({
      metamask: { remoteControlAccessRequests: requests },
    }),
  );

const pendingRequest = () => ({
  [ACCOUNT]: {
    account: ACCOUNT,
    delegate: '0x52addb05cb77211c6e525714495d5bffe7103e57',
    controller: CONTROLLER,
    unlockTime: nowSeconds() + 200,
    expiresAt: nowSeconds() + 3800,
  },
});

describe('RemoteControlAccessAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitRequestToBackground.mockResolvedValue({});
  });

  it('renders nothing when there are no requests', () => {
    const { queryByTestId } = renderAlert({});

    expect(
      queryByTestId('remote-control-access-alert'),
    ).not.toBeInTheDocument();
  });

  it('asks the background to re-check on mount', () => {
    renderAlert({});

    expect(mockSubmitRequestToBackground).toHaveBeenCalledWith(
      'messengerCall',
      ['RemoteControlController:checkAccessRequests', []],
    );
  });

  it('warns about a pending request and names the controller', () => {
    const { getByTestId } = renderAlert(pendingRequest());

    expect(getByTestId('remote-control-access-alert')).toHaveTextContent(
      CONTROLLER,
    );
  });

  it('does not show expired requests', () => {
    const { queryByTestId } = renderAlert({
      [ACCOUNT]: {
        ...pendingRequest()[ACCOUNT],
        unlockTime: nowSeconds() - 4000,
        expiresAt: nowSeconds() - 400,
      },
    });

    expect(
      queryByTestId('remote-control-access-alert'),
    ).not.toBeInTheDocument();
  });

  it('blocks the request for the targeted account', async () => {
    const { getByTestId } = renderAlert(pendingRequest());

    fireEvent.click(getByTestId('remote-control-access-block'));

    await waitFor(() => {
      expect(mockSubmitRequestToBackground).toHaveBeenCalledWith(
        'messengerCall',
        ['RemoteControlController:blockAccessRequest', [ACCOUNT]],
      );
    });
  });

  it('shows why blocking failed', async () => {
    mockSubmitRequestToBackground.mockImplementation(async (_method, args) => {
      const [action] = args as [string];
      if (action === 'RemoteControlController:blockAccessRequest') {
        throw new Error('Pimlico did not accept the sponsored transaction: x');
      }
      return {};
    });
    const { getByTestId } = renderAlert(pendingRequest());

    fireEvent.click(getByTestId('remote-control-access-block'));

    await waitFor(() => {
      expect(
        getByTestId('remote-control-access-block-error'),
      ).toHaveTextContent(
        'Pimlico did not accept the sponsored transaction: x',
      );
    });
  });
});
