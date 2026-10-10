import { RemoteControlController } from '../../controllers/remote-control/RemoteControlController';
import type { RemoteControlControllerMessenger } from '../../controllers/remote-control/RemoteControlController';
import { MessengerClientInitFunction } from '../types';

/**
 * Initialize the remote control controller.
 *
 * @param request - The request object.
 * @returns The initialized controller.
 */
export const RemoteControlControllerInit: MessengerClientInitFunction<
  RemoteControlController,
  RemoteControlControllerMessenger
> = (request) => {
  const messengerClient = new RemoteControlController({
    messenger: request.controllerMessenger,
  });

  return {
    messengerClient,
    // The controller holds no state: recovery keys are returned to the caller
    // and never persisted.
    persistedStateKey: null,
  };
};
