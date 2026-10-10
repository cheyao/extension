import React from 'react';
import { Box } from '@metamask/design-system-react';

/**
 * Swissquote "wallet ready" animation: a thin orange ring draws around the
 * Swissquote mark, then a check settles in. Sober and short; static when the
 * user prefers reduced motion. Replaces MetaMask's Rive fox animation.
 */
export default function WalletReadyAnimation() {
  return (
    <Box
      className="riv-animation__wallet-ready-container sq-ready"
      data-testid="swissquote-wallet-ready"
    >
      <svg
        className="sq-ready__art"
        viewBox="0 0 200 200"
        width="200"
        height="200"
        aria-hidden="true"
      >
        <circle className="sq-ready__track" cx="100" cy="100" r="84" />
        <circle className="sq-ready__ring" cx="100" cy="100" r="84" />
        <g className="sq-ready__mark">
          <rect x="64" y="64" width="72" height="72" rx="16" fill="#EF6C1A" />
          <path d="M100 81L119 100L100 119L81 100Z" fill="#FFFFFF" />
          <path d="M100 92L108 100L100 108L92 100Z" fill="#EF6C1A" />
        </g>
        <g className="sq-ready__check">
          <circle cx="146" cy="146" r="17" />
          <path d="M138 146.5L144 152.5L155 140" />
        </g>
      </svg>
    </Box>
  );
}
