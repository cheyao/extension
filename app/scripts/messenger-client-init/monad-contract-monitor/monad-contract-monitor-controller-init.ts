import { MonadContractMonitorController } from '../../controllers/monad-contract-monitor/MonadContractMonitorController';
import type { MonadContractMonitorMessenger } from '../../controllers/monad-contract-monitor/MonadContractMonitor-types';
import { MessengerClientInitFunction } from '../types';

/**
 * Initialize the Monad contract monitor controller.
 *
 * @param request - The request object.
 * @returns The initialized controller.
 */
export const MonadContractMonitorInit: MessengerClientInitFunction<
  MonadContractMonitorController,
  MonadContractMonitorMessenger
> = (request) => {
  const messenger = request.controllerMessenger;

  const controller = new MonadContractMonitorController({
    messenger,
  });

  return {
    controller,
  };
};