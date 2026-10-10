import { Messenger } from '@metamask/messenger';

import { getRootMessenger } from '../../lib/messenger';
import { getRemoteControlControllerMessenger } from './remote-control-controller-messenger';

describe('getRemoteControlControllerMessenger', () => {
  it('returns a restricted messenger', () => {
    const messenger = getRootMessenger<never, never>();

    expect(getRemoteControlControllerMessenger(messenger)).toBeInstanceOf(
      Messenger,
    );
  });

  it('delegates exactly the actions the controller needs', () => {
    const messenger = getRootMessenger<never, never>();
    const delegateSpy = jest.spyOn(messenger, 'delegate');

    getRemoteControlControllerMessenger(messenger);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger: expect.any(Messenger),
      actions: [
        'AccountsController:getSelectedAccount',
        'KeyringController:signEip7702Authorization',
        'KeyringController:signTypedMessage',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getNetworkClientById',
      ],
    });
  });
});
