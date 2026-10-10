import { Messenger } from '@metamask/messenger';

import {
  RemoteControlController,
  type RemoteControlControllerState,
  type RemoteControlControllerGetStateAction,
  type RemoteControlControllerStateChangeEvent,
} from './RemoteControlController';
import type { RemoteControlControllerMethodActions } from './RemoteControlController-method-action-types';

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
      ['isRemoteControlAvailable', 'deployRemoteControlDelegate'],
    );
  });

  it('starts with empty state', () => {
    const controller = setupController();

    expect(controller.state).toStrictEqual<RemoteControlControllerState>({});
    expect(controller.name).toBe('RemoteControlController');
  });

  it('holds no state after a failed deployment attempt', async () => {
    const controller = setupController();

    await expect(
      controller.deployRemoteControlDelegate(),
    ).rejects.toBeDefined();

    expect(controller.state).toStrictEqual<RemoteControlControllerState>({});
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
