/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { RemoteControlController } from './RemoteControlController';

/**
 * Whether this build can perform a remote-control deployment. Callers use
 * this to decide between running the onboarding step and skipping it.
 *
 * @returns Whether the feature is configured.
 */
export type RemoteControlControllerIsRemoteControlAvailableAction = {
  type: `RemoteControlController:isRemoteControlAvailable`;
  handler: RemoteControlController['isRemoteControlAvailable'];
};

/**
 * Generates three recovery keys, deploys the remote-control delegate with
 * them baked in as immutables, and returns both the keys and the deployed
 * address.
 *
 * The deployment is sponsored by the configured paymaster, so the account
 * needs no MON — which matters because this runs during wallet creation,
 * where the account is brand new and empty.
 *
 * @returns The deployment result. The private keys are not retained by the
 * controller after this returns.
 */
export type RemoteControlControllerDeployRemoteControlDelegateAction = {
  type: `RemoteControlController:deployRemoteControlDelegate`;
  handler: RemoteControlController['deployRemoteControlDelegate'];
};

/**
 * Union of all RemoteControlController action types.
 */
export type RemoteControlControllerMethodActions =
  | RemoteControlControllerIsRemoteControlAvailableAction
  | RemoteControlControllerDeployRemoteControlDelegateAction;
