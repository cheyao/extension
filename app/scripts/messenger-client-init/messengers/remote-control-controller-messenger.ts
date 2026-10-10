import {
  Messenger,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';
import type { RemoteControlControllerMessenger } from '../../controllers/remote-control/RemoteControlController';
import type { RootMessenger } from '../../../lib/messenger';

/**
 * Get a restricted controller messenger for the remote control controller.
 * This is scoped to the actions the remote control controller is allowed to
 * handle.
 *
 * @param messenger - The root messenger.
 * @returns The controller messenger.
 */
export function getRemoteControlControllerMessenger(
  messenger: RootMessenger<
    MessengerActions<RemoteControlControllerMessenger>,
    MessengerEvents<RemoteControlControllerMessenger>
  >,
): RemoteControlControllerMessenger {
  const remoteControlControllerMessenger: RemoteControlControllerMessenger =
    new Messenger({
      namespace: 'RemoteControlController',
      parent: messenger,
    });

  messenger.delegate({
    messenger: remoteControlControllerMessenger,
    actions: [
      'AccountsController:getSelectedAccount',
      'AccountsController:listAccounts',
      'KeyringController:signEip7702Authorization',
      'KeyringController:signTypedMessage',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
    ],
  });

  return remoteControlControllerMessenger;
}
