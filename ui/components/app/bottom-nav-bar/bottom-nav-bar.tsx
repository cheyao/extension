import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Icon,
  IconColor,
  IconName,
  IconSize,
  Text,
  TextVariant,
  TextColor,
  FontWeight,
} from '@metamask/design-system-react';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  ACTIVITY_ROUTE,
  DEFAULT_ROUTE,
} from '../../../helpers/constants/routes';
import { ScreenViewedEntryPoint } from '../../../../shared/constants/metametrics';
import { getDefaultHomeActiveTabName } from '../../../selectors';
import { transitionForward } from '../../ui/transition';
import { getActiveBottomNavTabs } from './bottom-nav-bar.utils';

type NavTabProps = {
  isActive: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
  'data-testid'?: string;
};

const NavTab = ({
  isActive,
  icon,
  label,
  onClick,
  'data-testid': testId,
}: NavTabProps) => {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="group/tab flex flex-1 flex-col gap-1 items-center justify-center"
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
    >
      <Icon
        name={icon}
        size={IconSize.Lg}
        color={isActive ? IconColor.IconDefault : IconColor.IconAlternative}
        className="transition-colors duration-200 group-hover/tab:text-icon-default-hover"
      />
      <Text
        variant={TextVariant.BodySm}
        fontWeight={FontWeight.Medium}
        color={isActive ? TextColor.TextDefault : TextColor.TextAlternative}
        className="transition-colors duration-200 group-hover/tab:text-text-default"
      >
        {label}
      </Text>
    </button>
  );
};

export function BottomNavBar() {
  const t = useI18nContext();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lastActiveTab = useSelector(getDefaultHomeActiveTabName);

  const { isHome, isActivity } = getActiveBottomNavTabs(pathname);

  const handleHomeClick = useCallback(() => {
    transitionForward(() =>
      navigate(
        lastActiveTab ? `${DEFAULT_ROUTE}?tab=${lastActiveTab}` : DEFAULT_ROUTE,
        {
          state: {
            entryPoint: ScreenViewedEntryPoint.BottomNavClick,
            stayOnHomePage: true,
          },
        },
      ),
    );
  }, [navigate, lastActiveTab]);

  const handleActivityClick = useCallback(() => {
    transitionForward(() =>
      navigate(ACTIVITY_ROUTE, {
        state: {
          entryPoint: ScreenViewedEntryPoint.BottomNavClick,
          stayOnHomePage: true,
        },
      }),
    );
  }, [navigate]);

  return (
    <nav
      data-testid="parent-selector-bottom-nav-bar"
      className="bottom-nav-bar sticky bottom-0 mt-auto w-full shrink-0 bg-background-default border-t border-[color:var(--bar-border-color)] flex flex-row justify-between p-2 gap-2 z-[100] transition-[background-color,backdrop-filter] duration-200"
      style={{ viewTransitionName: 'bottom-nav-bar' }}
    >
      <NavTab
        isActive={isHome}
        icon={isHome ? IconName.HomeFilled : IconName.Home}
        label={t('home')}
        onClick={handleHomeClick}
        data-testid="bottom-nav-home"
      />
      <NavTab
        isActive={isActivity}
        icon={isActivity ? IconName.ClockFilled : IconName.Clock}
        label={t('activity')}
        onClick={handleActivityClick}
        data-testid="bottom-nav-activity"
      />
    </nav>
  );
}
