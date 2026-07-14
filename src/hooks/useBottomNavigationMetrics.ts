import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const BOTTOM_NAV_CONTENT_HEIGHT = 62;
export const BOTTOM_NAV_MIN_INSET = 8;
export const BOTTOM_NAV_CONTENT_GAP = 24;

/** Shared dimensions for fixed bottom navigation and scrollable screen content. */
export function useBottomNavigationMetrics() {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const bottomPadding = Math.max(bottomInset, BOTTOM_NAV_MIN_INSET);
  const barHeight = BOTTOM_NAV_CONTENT_HEIGHT + bottomPadding;

  return {
    bottomInset,
    bottomPadding,
    barHeight,
    contentBottomPadding: barHeight + BOTTOM_NAV_CONTENT_GAP,
  };
}
