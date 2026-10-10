import { Messenger } from '@metamask/messenger';
import { zeroAddress } from 'viem';

import {
  RemoteControlController,
  type RemoteControlControllerMessenger,
  type RemoteControlControllerState,
  type RemoteControlControllerGetStateAction,
  type RemoteControlControllerStateChangeEvent,
} from './RemoteControlController';
import type { RemoteControlControllerMethodActions } from './RemoteControlController-method-action-types';

const mockClient = {
  getBlock: jest.fn(),
  getCode: jest.fn(),
  readContract: jest.fn(),
};

jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: () => mockClient,
}));

const MOCK_ANY_NAMESPACE = 'RemoteControlController' as const;

type AllowedActions =
  | RemoteControlControllerMethodActions
  | RemoteControlControllerGetStateAction;

type MockMessenger = Messenger<
  typeof MOCK_ANY_NAMESPACE,
  AllowedActions,
  RemoteControlControllerStateChangeEvent
>;

describe('RemoteControlController', () => {
  let messenger: MockMessenger;

  beforeEach(() => {
    messenger = new Messenger<
      typeof MOCK_ANY_NAMESPACE,
      AllowedActions,
      RemoteControlControllerStateChangeEvent
    >({ namespace: MOCK_ANY_NAMESPACE });
    jest.spyOn(messenger, 'registerMethodActionHandlers');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const setupController = () => new RemoteControlController({ messenger });

  it('registers its method actions on the messenger', () => {
    setupController();

    expect(messenger.registerMethodActionHandlers).toHaveBeenCalledWith(
      expect.any(RemoteControlController),
      [
        'isRemoteControlAvailable',
        'deployRemoteControlDelegate',
        'checkAccessRequests',
        'blockAccessRequest',
      ],
    );
  });

  it('starts with no unlock requests', () => {
    const controller = setupController();

    expect(controller.state).toStrictEqual<RemoteControlControllerState>({
      remoteControlAccessRequests: {},
    });
    expect(controller.name).toBe('RemoteControlController');
  });

  it('stores no keys after a failed deployment attempt', async () => {
    const controller = setupController();

    await expect(
      controller.deployRemoteControlDelegate(),
    ).rejects.toBeDefined();

    expect(controller.state).toStrictEqual<RemoteControlControllerState>({
      remoteControlAccessRequests: {},
    });
  });

  describe('isRemoteControlAvailable', () => {
    it('reports whether this build has a sponsoring endpoint', () => {
      const result = setupController().isRemoteControlAvailable();

      expect(result).toStrictEqual({ isConfigured: expect.any(Boolean) });
    });
  });

  describe('deployRemoteControlDelegate', () => {
    it('rejects when no gas station is configured for the build', async () => {
      jest.resetModules();
      jest.doMock('../../../../shared/constants/remote-control', () => ({
        ...jest.requireActual('../../../../shared/constants/remote-control'),
        REMOTE_CONTROL_GAS_STATION: undefined,
      }));

      const { RemoteControlController: UnconfiguredController } =
        await import('./RemoteControlController');
      const { RemoteControlControllerMethodActions: _actions } =
        await import('./RemoteControlController-method-action-types');

      const unconfiguredMessenger = new Messenger<
        typeof MOCK_ANY_NAMESPACE,
        AllowedActions,
        RemoteControlControllerStateChangeEvent
      >({ namespace: MOCK_ANY_NAMESPACE });

      const controller = new UnconfiguredController({
        messenger: unconfiguredMessenger,
      });

      expect(controller.isRemoteControlAvailable()).toStrictEqual({
        isConfigured: false,
      });
      await expect(controller.deployRemoteControlDelegate()).rejects.toThrow(
        /not configured/u,
      );
    });
  });
});

describe('RemoteControlController access requests', () => {
  const ACCOUNT = '0x5af0f461b6707b4510a3510be668c841cbf42130';
  const DELEGATE = '0x52addb05cb77211c6e525714495d5bffe7103e57';
  const CONTROLLER = '0xe49f06a43cb75c18b235efbc1dd8372fd36e538f';
  const NOW = 1_000_000;

  beforeEach(() => {
    mockClient.getBlock.mockResolvedValue({ timestamp: BigInt(NOW) });
    mockClient.getCode.mockResolvedValue(`0xef0100${DELEGATE.slice(2)}`);
    mockClient.readContract.mockResolvedValue([
      CONTROLLER,
      BigInt(NOW + 200),
      BigInt(NOW + 3800),
      BigInt(1),
    ]);
  });

  const setup = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = new Messenger<any, any, any>({ namespace: 'Root' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = new Messenger<any, any, any>({
      namespace: 'AccountsController',
      parent: root,
    });
    accounts.registerActionHandler('AccountsController:listAccounts', () => [
      { address: ACCOUNT, type: 'eip155:eoa' },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const network = new Messenger<any, any, any>({
      namespace: 'NetworkController',
      parent: root,
    });
    network.registerActionHandler(
      'NetworkController:findNetworkClientIdByChainId',
      () => {
        throw new Error('no client');
      },
    );
    const controllerMessenger = new Messenger({
      namespace: 'RemoteControlController',
      parent: root,
    }) as unknown as RemoteControlControllerMessenger;
    root.delegate({
      messenger: controllerMessenger,
      actions: [
        'AccountsController:listAccounts',
        'NetworkController:findNetworkClientIdByChainId',
      ],
    });
    return new RemoteControlController({ messenger: controllerMessenger });
  };

  it('records a pending unlock request', async () => {
    const controller = setup();

    await controller.checkAccessRequests();

    expect(controller.state.remoteControlAccessRequests).toStrictEqual({
      [ACCOUNT]: {
        account: ACCOUNT,
        delegate: DELEGATE,
        controller: CONTROLLER,
        unlockTime: NOW + 200,
        expiresAt: NOW + 3800,
      },
    });
  });

  it('ignores accounts with no access granted', async () => {
    mockClient.readContract.mockResolvedValue([
      zeroAddress,
      BigInt(0),
      BigInt(0),
      BigInt(0),
    ]);
    const controller = setup();

    await controller.checkAccessRequests();

    expect(controller.state.remoteControlAccessRequests).toStrictEqual({});
  });

  it('ignores expired access', async () => {
    mockClient.getBlock.mockResolvedValue({ timestamp: BigInt(NOW + 4000) });
    const controller = setup();

    await controller.checkAccessRequests();

    expect(controller.state.remoteControlAccessRequests).toStrictEqual({});
  });

  it('ignores accounts that are not delegated', async () => {
    mockClient.getCode.mockResolvedValue(undefined);
    const controller = setup();

    await controller.checkAccessRequests();

    expect(mockClient.readContract).not.toHaveBeenCalled();
    expect(controller.state.remoteControlAccessRequests).toStrictEqual({});
  });

  it('ignores delegations that are not a RemoteControlDelegate', async () => {
    mockClient.readContract.mockRejectedValue(new Error('execution reverted'));
    const controller = setup();

    await controller.checkAccessRequests();

    expect(controller.state.remoteControlAccessRequests).toStrictEqual({});
  });
});
