import React, { useEffect, useRef } from 'react';
import { Box } from '@metamask/design-system-react';
import classnames from 'clsx';
import { useRiveWasmContext } from '../../../contexts/rive-wasm';

type MetamaskWordMarkAnimationProps = {
  setIsAnimationComplete: (isAnimationComplete: boolean) => void;
  isAnimationComplete?: boolean;
  skipTransition?: boolean;
};

// Matches the end of the CSS intro sequence in index.scss (`sq-intro`).
const INTRO_DURATION_MS = 1600;

/**
 * Swissquote Wallet intro: the logo tile scales in, the diamond unfolds and
 * the wordmark slides up. Once done, the welcome page reveals its actions.
 *
 * Keeps the name and props of the MetaMask wordmark animation it replaces so
 * the welcome page wiring (skip on revisit, slide-up on complete) is unchanged.
 *
 * @param options0
 * @param options0.setIsAnimationComplete - Called once the intro has played.
 * @param options0.isAnimationComplete - Whether the intro has finished.
 * @param options0.skipTransition - Render the final state without animating.
 */
export default function MetamaskWordMarkAnimation({
  setIsAnimationComplete,
  isAnimationComplete = false,
  skipTransition = false,
}: MetamaskWordMarkAnimationProps) {
  const { setIsAnimationCompleted } = useRiveWasmContext();
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (isAnimationComplete) {
      return undefined;
    }
    // Never leave the welcome actions hidden: when skipping, reveal at once.
    if (skipTransition) {
      setIsAnimationComplete(true);
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      hasPlayedRef.current = true;
      setIsAnimationComplete(true);
    }, INTRO_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [skipTransition, isAnimationComplete, setIsAnimationComplete]);

  // Once the intro has actually played, skip it when the user comes back to
  // the welcome page. Gated on hasPlayedRef so StrictMode's simulated unmount
  // in development does not mark it complete before it has run.
  useEffect(() => {
    return () => {
      if (hasPlayedRef.current) {
        setIsAnimationCompleted('MetamaskWordMarkAnimation', true);
      }
    };
  }, [setIsAnimationCompleted]);

  return (
    <Box
      className={classnames(
        'riv-animation__wordmark-container',
        'sq-intro',
        {
          'riv-animation__wordmark-container--complete':
            isAnimationComplete && !skipTransition,
          'riv-animation__wordmark-container--skip-transition': skipTransition,
          'sq-intro--static': skipTransition,
        },
      )}
      data-testid="swissquote-wordmark"
    >
      <svg
        className="sq-intro__mark"
        viewBox="0 0 128 128"
        width="96"
        height="96"
        aria-hidden="true"
      >
        <rect
          className="sq-intro__tile"
          width="128"
          height="128"
          rx="28"
          fill="#EF6C1A"
        />
        <path
          className="sq-intro__diamond"
          d="M64 26L102 64L64 102L26 64Z"
          fill="#FFFFFF"
        />
        <path
          className="sq-intro__core"
          d="M64 48L80 64L64 80L48 64Z"
          fill="#EF6C1A"
        />
      </svg>
      <span className="sq-intro__name">Swissquote</span>
      <span className="sq-intro__product">Wallet</span>
    </Box>
  );
}
