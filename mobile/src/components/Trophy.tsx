import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../lib/theme';

export const medalColor = (position: number) => (position === 1 ? colors.gold : position === 2 ? colors.silver : position === 3 ? colors.bronze : colors.muted);

/** Filled trophy; `color` = medal colour, or muted for a not-yet-earned achievement. */
export function Trophy({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M7 3h10v6a5 5 0 0 1-10 0z" fill={color} />
      <Path d="M7 5H4a3 3 0 0 0 3 4.5M17 5h3a3 3 0 0 1-3 4.5" stroke={color} strokeWidth={1.6} fill="none" />
      <Rect x={11} y={13} width={2} height={4} fill={color} />
      <Rect x={7.5} y={17} width={9} height={3} rx={1} fill={color} />
    </Svg>
  );
}
