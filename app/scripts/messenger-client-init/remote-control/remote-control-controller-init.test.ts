import {
  RemoteControlController,
  RemoteControlControllerMessenger,
} from '../../controllers/remote-control/RemoteControlController';
import { buildControllerInitRequestMock } from '../test/utils';
import { MessengerClientInitRequest } from '../types';
import { getRemoteControlControllerMessenger } from '../messengers/remote-control-controller-messenger';
import { getRootMessenger } from '../../lib/messenger';
import { RemoteControlControllerInit } from './remote-control-controller-init';

jest.mock('../../controllers/remote-control/RemoteControlController');

function buildInitRequestMock(): jest.Mocked<
  MessengerClientInitRequest<RemoteControlControllerMessenger>
> {
  const baseControllerMessenger = getRootMessenger();

  return {
    ...buildControllerInitRequestMock(),
    controllerMessenger: getRemoteControlControllerMessenger(
      baseControllerMessenger,
    ),
    initMessenger: undefined,
  };
}

describe('RemoteControlControllerInit', () => {
  const remoteControlControllerClassMock = jest.mocked(RemoteControlController);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns a controller instance', () => {
    const requestMock = buildInitRequestMock();
    expect(
      RemoteControlControllerInit(requestMock).messengerClient,
    ).toBeInstanceOf(RemoteControlController);
  });

  it('passes the persisted state and the extension API', () => {
    const requestMock = buildInitRequestMock();

    expect(RemoteControlControllerInit(requestMock)).toStrictEqual({
      messengerClient: expect.any(RemoteControlController),
    });
    expect(remoteControlControllerClassMock).toHaveBeenCalledWith({
      messenger: requestMock.controllerMessenger,
      state: requestMock.persistedState.RemoteControlController,
      extension: requestMock.extension,
    });
  });
});
