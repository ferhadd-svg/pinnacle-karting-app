import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, weight } from '../lib/theme';

/** Pinnacle peak mark: a summit over a start line. */
export function PeakMark({ size = 40, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M8 48 L32 10 L56 48 H44 L32 28 L20 48 Z" fill={color} />
      <Rect x={10} y={52} width={44} height={5} rx={2.5} fill={colors.text} />
    </Svg>
  );
}

export function Wordmark() {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="Pinnacle Karting">
      <PeakMark size={44} />
      <View>
        <Text style={styles.top}>PINNACLE</Text>
        <Text style={styles.bottom}>KARTING</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center' },
  top: { color: colors.text, fontSize: 26, fontWeight: weight.thin, letterSpacing: 4, lineHeight: 28 },
  bottom: { color: colors.accent, fontSize: 12, fontWeight: weight.regular, letterSpacing: 8.5 },
});
