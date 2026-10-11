import React from 'react';
import { Box } from '@metamask/design-system-react';
import classnames from 'clsx';

type FoxAppearAnimationProps = {
  isLoader?: boolean;
  skipTransition?: boolean;
};

// Concentric diamonds echoing the Swissquote Wallet mark, largest first.
const DIAMOND_SIZES = [420, 300, 180];

/**
 * Swissquote brand visual shown at the bottom of the welcome and unlock pages
 * (concentric diamonds rising in), or as a loader (the logo inside a rotating
 * arc) while logging in.
 *
 * Keeps the name and props of the MetaMask fox animation it replaces.
 *
 * @param options0
 * @param options0.isLoader - Render the login loader instead of the backdrop.
 * @param options0.skipTransition - Render the final state without animating.
 */
export default function FoxAppearAnimation({
  isLoader = false,
  skipTransition = false,
}: FoxAppearAnimationProps) {
  if (isLoader) {
    return (
      <Box className="riv-animation__fox-container--loader sq-loader">
        <img
          className="sq-loader__mark"
          src="./images/logo/swissquote-logo.svg"
          width="64"
          height="64"
          alt=""
        />
        <svg
          data-testid="loading-indicator"
          className="sq-loader__arc"
          viewBox="0 0 120 120"
          aria-hidden="true"
        >
          <circle className="sq-loader__arc-track" cx="60" cy="60" r="58" />
          <circle className="sq-loader__arc-head" cx="60" cy="60" r="58" />
        </svg>
      </Box>
    );
  }

  return (
    <Box
      className={classnames('riv-animation__fox-container', 'sq-backdrop', {
        'sq-backdrop--static': skipTransition,
      })}
      data-testid="swissquote-backdrop"
    >
      <svg
        className="sq-backdrop__art"
        viewBox="0 0 600 340"
        preserveAspectRatio="xMidYMax meet"
        aria-hidden="true"
      >
        {DIAMOND_SIZES.map((size, index) => {
          const half = size / 2;
          const cx = 300;
          const cy = 340;
          return (
            <path
              key={size}
              className={`sq-backdrop__diamond sq-backdrop__diamond--${index}`}
              d={`M${cx} ${cy - half}L${cx + half} ${cy}L${cx} ${cy + half}L${cx - half} ${cy}Z`}
            />
          );
        })}
      </svg>
    </Box>
  );
}
