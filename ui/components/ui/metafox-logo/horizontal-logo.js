import React from 'react';
import PropTypes from 'prop-types';
import { ThemeType } from '../../../../shared/constants/preferences';

const LOGO_WIDTH = 127;
const LOGO_HEIGHT = 32;

export default function MetaFoxHorizontalLogo({
  theme: themeProps,
  className,
}) {
  const theme =
    themeProps === undefined
      ? document.documentElement.getAttribute('data-theme')
      : themeProps;

  const fill = theme === ThemeType.dark ? 'rgb(255,255,255)' : 'rgb(22,22,22)';

  return (
    <svg
      height={LOGO_HEIGHT}
      width={LOGO_WIDTH}
      viewBox="0 88 696 176"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="0" y="92" width="160" height="160" rx="35" fill="#EF6C1A" />
      <path d="M80 124L128 172L80 220L32 172Z" fill="#FFFFFF" />
      <path d="M80 152L100 172L80 192L60 172Z" fill="#EF6C1A" />
      <text
        x="196"
        y="168"
        fill={fill}
        fontFamily="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontSize="84"
        fontWeight="700"
        letterSpacing="-2.5"
      >
        Swissquote
      </text>
      <text
        x="198"
        y="254"
        fill="#EF6C1A"
        fontFamily="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontSize="72"
        fontWeight="500"
      >
        Wallet
      </text>
    </svg>
  );
}

MetaFoxHorizontalLogo.propTypes = {
  theme: PropTypes.oneOf([ThemeType.light, ThemeType.dark, ThemeType.os]),
  className: PropTypes.string,
};
