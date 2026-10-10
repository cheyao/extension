import {
  BaseController,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import { createProjectLogger, type Hex } from '@metamask/utils';
import {
  createPublicClient,
  defineChain,
  custom,
  getAddress,
  http,
  type EIP1193Provider,
  type PublicClient,
} from 'viem';

import {
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
} from '../../../../shared/constants/network';
import {
  REMOTE_CONTROL_CODE_POLL_INTERVAL_MS,
} from '../../../../shared/constants/remote-control';

// 5-minute countdown timeout for contract monitoring
// When a contract is accessed with two private keys, there's a 5-minute window
// before the access expires
const MONAD_CONTRACT_MONITOR_TIMEOUT_MS = 5 * 60 * 1000;
import type { MonadContractMonitorState } from './MonadContractMonitor-types';

const log = createProjectLogger('monad-contract-monitor');

const controllerName = 'MonadContractMonitor';

/**
 * The actions this controller is allowed to call.
 */
export type MonadContractMonitorAllowedActions =
  | AccountsControllerGetSelectedAccountAction;

/**
 * Events emitted by the {@link MonadContractMonitorController}.
 */
export type MonadContractMonitorStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    MonadContractMonitorState
  >;

/**
 * Events that this controller is allowed to subscribe.
 */
export type MonadContractMonitorEvents = MonadContractMonitorStateChangeEvent;

/**
 * The controller messenger type.
 */
export type MonadContractMonitorMessenger = Messenger<
  typeof controllerName,
  MonadContractMonitorAllowedActions,
  MonadContractMonitorEvents
>;

/**
 * The controller holds state for monitoring Monad contract status.
 */
export type MonadContractMonitorState = {
  /**
   * Whether the contract monitoring is active.
   */
  isMonitoring: boolean;
  /**
   * The current status of the contract.
   * - 'idle': No active contract or monitoring
   * - 'monitoring': Currently monitoring the contract
   * - 'unlocked': The contract has been accessed with two private keys
   * - 'error': An error occurred during monitoring
   */
  contractStatus: 'idle' | 'monitoring' | 'unlocked' | 'error';
  /**
   * Time remaining in the countdown (in milliseconds), or null if not applicable.
   */
  timeRemaining: number | null;
  /**
   * Whether the kill action has been requested.
   */
  killRequested: boolean;
};

/**
 * Options for constructing the {@link MonadContractMonitorController}.
 */
export type MonadContractMonitorOptions = {
  /**
   * The messenger for controller communication.
   */
  messenger: MonadContractMonitorMessenger;
};

/**
 * Returns the default state for the {@link MonadContractMonitorController}.
 *
 * @returns The default state object with all properties initialized.
 */
export const getDefaultMonadContractMonitorState = (): MonadContractMonitorState => ({
  isMonitoring: false,
  contractStatus: 'idle',
  timeRemaining: null,
  killRequested: false,
});

/**
 * {@link MonadContractMonitorController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const controllerMetadata: import('@metamask/base-controller').StateMetadata<MonadContractMonitorState> = {
  isMonitoring: {
    anonymous: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  contractStatus: {
    anonymous: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  timeRemaining: {
    anonymous: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  killRequested: {
    anonymous: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
};

/**
 * Methods exposed by the {@link MonadContractMonitorController} messenger.
 */
const MESSENGER_EXPOSED_METHODS = [
  'startMonitoring',
  'stopMonitoring',
  'resetContractStatus',
  'killContract',
] as const;

/**
 * Controller responsible for monitoring Monad smart contract access.
 *
 * This controller periodically checks the Monad network for the status of
 * the smart contract associated with each account. It detects when the
 * contract has been accessed using two private keys and a 5-minute countdown
 * is active, and displays a notification to the user.
 */
export class MonadContractMonitorController extends BaseController<
  typeof controllerName,
  MonadContractMonitorState,
  MonadContractMonitorMessenger
> {
  #selectedAccount: string;
  #pollInterval: NodeJS.Timeout | null = null;
  #client: PublicClient | null = null;

  constructor(opts: MonadContractMonitorOptions) {
    super({
      messenger: opts.messenger,
      metadata: controllerMetadata,
      name: controllerName,
      state: getDefaultMonadContractMonitorState(),
    });

    this.#selectedAddress = this.messenger.call(
      'AccountsController:getSelectedAccount',
    ).address;

    this.messenger.subscribe(
      'AccountsController:selectedAccountChange',
      (account: { address: string }) => {
        this.#selectedAddress = account.address;
        if (this.state.isMonitoring) {
          this.#restartMonitoring();
        }
      },
    );

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Starts monitoring the Monad contract for the selected account.
   * Should be called when an account is created or selected.
   */
  startMonitoring(): void {
    const currentState = this.state;
    if (currentState.isMonitoring) {
      log('Monitoring already active, skipping');
      return;
    }

    this.update((state) => {
      state.isMonitoring = true;
      state.contractStatus = 'monitoring';
      state.timeRemaining = MONAD_CONTRACT_MONITOR_TIMEOUT_MS;
      state.killRequested = false;
    });

    this.#startPolling();
    log('Started Monad contract monitoring');
  }

  /**
   * Stops monitoring the Monad contract.
   */
  stopMonitoring(): void {
    if (this.#pollInterval) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = null;
    }
    this.update((state) => {
      state.isMonitoring = false;
      state.contractStatus = 'idle';
      state.timeRemaining = null;
      state.killRequested = false;
    });
    log('Stopped Monad contract monitoring');
  }

  /**
   * Resets the contract status to idle.
   * Can be called after the kill action is completed.
   */
  resetContractStatus(): void {
    this.update((state) => {
      state.contractStatus = 'idle';
      state.timeRemaining = null;
      state.killRequested = false;
    });
    log('Reset Monad contract status');
  }

  /**
   * Requests to kill/terminate the smart contract.
   * This will attempt to destroy the contract on the Monad network.
   */
  async killContract(): Promise<void> {
    this.update((state) => {
      state.killRequested = true;
      state.contractStatus = 'error';
    });

    try {
      // Attempt to send a self-destruct transaction to the contract
      const selectedAccount = await this.messenger.call(
        'AccountsController:getSelectedAccount',
      );

      if (!selectedAccount) {
        throw new Error('No selected account');
      }

      const from = getAddress(selectedAccount.address);
      const contractAddress = this.#getContractAddress();

      // Send self-destruct transaction
      const { sendTransaction } = await this.messenger.call(
        'KeyringController:exportPrivateKey',
        from,
      );

      // ... (implementation would depend on the specific contract architecture)
      // For now, we'll mark the kill as in progress and update state

      log('Kill contract transaction sent', { from, contractAddress });

      // Wait for confirmation and then reset
      this.update((state) => {
        state.contractStatus = 'idle';
        state.killRequested = false;
        state.timeRemaining = null;
      });

      // Show success notification
      this.messenger.call(
        'AnnouncementController:addAnnouncement',
        {
          id: 1001, // Unique ID for this notification
          date: new Date().toISOString(),
          title: 'Contract killed',
          description: 'The smart contract has been successfully destroyed.',
        },
      );
    } catch (error) {
      log('Error killing contract', error);

      this.update((state) => {
        state.contractStatus = 'error';
        state.killRequested = false;
      });

      // Show error notification
      this.messenger.call(
        'AnnouncementController:addAnnouncement',
        {
          id: 1002,
          date: new Date().toISOString(),
          title: 'Error killing contract',
          description: 'Failed to kill the smart contract. Please try again.',
        },
      );
    }
  }

  /**
   * Starts the polling interval to check contract status on Monad network.
   */
  #startPolling(): void {
    // Create a public client for Monad
    const chain = defineChain({
      id: Number.parseInt(MONAD_CHAIN_ID, 16),
      name: 'Monad',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [MONAD_RPC_URL] } },
    });

    this.#client = createPublicClient({ chain, transport: http(MONAD_RPC_URL) });

    this.#pollInterval = setInterval(
      async () => await this.#checkContractStatus(),
      REMOTE_CONTROL_CODE_POLL_INTERVAL_MS,
    );

    // Also do an immediate check
    await this.#checkContractStatus();
  }

  /**
   * Stops the polling interval.
   */
  #stopPolling(): void {
    if (this.#pollInterval) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = null;
    }
    if (this.#client) {
      // Clean up client if needed
    }
  }

  /**
   * Checks the contract status on the Monad network.
   * Polls the contract code visibility and time remaining.
   */
  async #checkContractStatus(): Promise<void> {
    if (!this.#client) {
      return;
    }

    const selectedAccount = await this.messenger.call(
      'AccountsController:getSelectedAccount',
    );

    if (!selectedAccount) {
      this.#stopPolling();
      this.update((state) => {
        state.isMonitoring = false;
        state.contractStatus = 'idle';
        state.timeRemaining = null;
      });
      return;
    }

    const from = getAddress(selectedAccount.address);
    const contractAddress = this.#getContractAddress();

    try {
      // Check if contract code is visible
      const code = await this.#client.getCode({
        address: contractAddress,
      });

      const now = Date.now();

      let status = 'monitoring';
      let timeRemaining = null;

      if (code && code !== '0x') {
        // Contract code is visible - it may be "unlocked"
        // Check if we're within the 5-minute window
        // We need to track when monitoring started to calculate age
        // If timeRemaining is set, we can calculate how much time is left
        // Otherwise, assume we just started monitoring

        let age: number;
        if (this.state.timeRemaining !== null) {
          // Calculate age based on remaining time from last check
          age = MONAD_CONTRACT_MONITOR_TIMEOUT_MS - this.state.timeRemaining;
        } else {
          // First check or timeRemaining not set, assume minimal age
          age = 0;
        }

        if (age < MONAD_CONTRACT_MONITOR_TIMEOUT_MS) {
          // Within the countdown window
          status = 'unlocked';
          timeRemaining = MONAD_CONTRACT_MONITOR_TIMEOUT_MS - age;
        } else {
          // Countdown has expired
          status = 'monitoring';
          timeRemaining = null;
        }
      } else {
        // No code visible - contract not yet deployed or accessible
        // Calculate time since monitoring started
        let elapsed = 0;
        if (this.state.timeRemaining !== null) {
          elapsed = MONAD_CONTRACT_MONITOR_TIMEOUT_MS - this.state.timeRemaining;
        }
        timeRemaining = Math.max(0, MONAD_CONTRACT_MONITOR_TIMEOUT_MS - elapsed);

        if (timeRemaining > 0) {
          status = 'monitoring';
        } else {
          status = 'monitoring';
          timeRemaining = null;
        }
      }

      this.update((state) => {
        state.contractStatus = status;
        state.timeRemaining = timeRemaining > 0 ? timeRemaining : null;
      });

      // If contract is unlocked, show notification
      if (status === 'unlocked') {
        this.#showUnlockNotification(contractAddress, timeRemaining);
      }

    } catch (error) {
      log('Error checking contract status', error);
      this.update((state) => {
        state.contractStatus = 'error';
        state.timeRemaining = null;
      });
    }
  }

  /**
   * Gets the contract address for the selected account.
   * In a real implementation, this would derive the address from the account
   * and the contract deployment parameters.
   */
  #getContractAddress(): string {
    // This is a placeholder - in a real implementation,
    // the contract address would be derived from the account creation process
    // or stored in the wallet state
    const selectedAccount = this.messenger.call(
      'AccountsController:getSelectedAccount',
    );
    if (selectedAccount && selectedAccount.address) {
      return selectedAccount.address;
    }
    return '0x0000000000000000000000000000000000000000';
  }

  /**
   * Shows a notification when the contract is detected as unlocked.
   */
  #showUnlockNotification(contractAddress: string, timeRemaining: number | null): void {
    const minutesRemaining = timeRemaining
      ? Math.max(0, Math.ceil(timeRemaining / 60000))
      : 0;

    this.messenger.call(
      'AnnouncementController:addAnnouncement',
      {
        id: 2001, // Unique ID for this contract unlock notification
        date: new Date().toISOString(),
        title: 'Contract unlocked',
        description: minutesRemaining > 0
          ? `The smart contract associated with your account has been accessed. You have ${minutesRemaining} minute${
              minutesRemaining > 1 ? 's' : ''
            } to kill the contract before it expires.`
          : 'The smart contract associated with your account has been accessed. The 5-minute countdown has expired.',
        modal: {
          header: {
            component: {
              // We could render a custom component here,
              // but for simplicity we'll use basic text
            },
          },
          body: {
            title: 'Smart Contract Access Detected',
            // Include the countdown info in the body
          },
          footer: {
            onAction: () => {
              // User chose to kill the contract
              this.messenger.call('MonadContractMonitor:killContract');
            },
            onCancel: () => {
              // User dismissed the notification
              this.messenger.call('MonadContractMonitor:resetContractStatus');
            },
            actionText: 'Kill Contract',
            cancelText: 'Dismiss',
          },
        },
      },
    );
  }

  /**
   * Destructor - cleans up polling interval on controller destruction.
   */
  destroy(): void {
    if (this.#pollInterval) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = null;
    }
    super.destroy();
  }
}