import { getMessenger } from '../messengers';

export function getMonadContractMonitorControllerMessenger(
  baseMessenger: import('@metamask/messenger').Messenger
): import('@metamask/messenger').Messenger<
  'MonadContractMonitor',
  import('./MonadContractMonitor-types').MonadContractMonitorAllowedActions,
  import('./MonadContractMonitor-types').MonadContractMonitorEvents
> {
  return getMessenger(baseMessenger, 'MonadContractMonitor');
}