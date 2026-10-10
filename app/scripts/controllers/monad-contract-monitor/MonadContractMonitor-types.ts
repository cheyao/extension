/**
 * State shape for the MonadContractMonitorController.
 *
 * @property isMonitoring - Whether the contract monitoring is active
 * @property contractStatus - Current status of the contract ('idle' | 'monitoring' | 'unlocked' | 'error')
 * @property timeRemaining - Time remaining in the countdown (milliseconds), or null if not applicable
 * @property killRequested - Whether the kill action has been requested
 */
export type MonadContractMonitorState = {
  isMonitoring: boolean;
  contractStatus: 'idle' | 'monitoring' | 'unlocked' | 'error';
  timeRemaining: number | null;
  killRequested: boolean;
};

/**
 * Options for constructing the MonadContractMonitorController.
 */
export type MonadContractMonitorOptions = {
  /**
   * The messenger for controller communication.
   */
  messenger: import('@metamask/messenger').Messenger<
    'MonadContractMonitor',
    import('@metamask/base-controller').ControllerGetStateAction<'MonadContractMonitor', MonadContractMonitorState>,
    import('@metamask/base-controller').ControllerStateChangeEvent<'MonadContractMonitor', MonadContractMonitorState>
  >;
};