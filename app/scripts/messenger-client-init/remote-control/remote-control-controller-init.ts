import { RemoteControlController } from '../../controllers/remote-control/RemoteControlController';
import type { RemoteControlControllerMessenger } from '../../controllers/remote-control/RemoteControlController';
import { MessengerClientInitFunction } from '../types';

/**
 * Initialize the remote control controller.
 *
 * @param request - The request object.
 * @param request.controllerMessenger - The controller messenger.
 * @param request.persistedState - The persisted state of the extension.
 * @param request.extension - The extension browser API, used to watch for
 * unlock requests in the background and raise notifications.
 * @returns The initialized controller.
 */
export const RemoteControlControllerInit: MessengerClientInitFunction<
  RemoteControlController,
  RemoteControlControllerMessenger
> = ({ controllerMessenger, persistedState, extension }) => {
  const messengerClient = new RemoteControlController({
    messenger: controllerMessenger,
    state: persistedState.RemoteControlController,
    extension,
  });

  // Persisted so that each unlock request is notified once across restarts.
  // Recovery keys are never part of the state.
  return { messengerClient };
};
