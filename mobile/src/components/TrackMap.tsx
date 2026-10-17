import Svg, { Path } from 'react-native-svg';
import { colors } from '../lib/theme';

/** Track outline from an SVG path in a 0..100 box; a double stroke reads as tarmac with a racing line. */
export function TrackMap({ path, color = colors.accentSoft, size = 110 }: { path: string | null; color?: string; size?: number }) {
  if (!path) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={path} stroke={colors.text} strokeWidth={5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Path d={path} stroke={colors.bg} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Path d={path} stroke={color} strokeWidth={1} fill="none" strokeLinejoin="round" strokeDasharray="5 4" />
    </Svg>
  );
}
