import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';
import { formatMemberCode } from '../lib/format';
import { colors, radius, space, weight } from '../lib/theme';

/** QR drawn from the code's module matrix: one SVG path, crisp at any size, no image files. */
export function Qr({ value, size }: { value: string; size: number }) {
  const { path, n } = useMemo(() => {
    const m = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
    let d = '';
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, n: m.size };
  }, [value]);
  const quiet = 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${n + quiet * 2} ${n + quiet * 2}`}>
      <Rect x={-quiet} y={-quiet} width={n + quiet * 2} height={n + quiet * 2} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

/** Digital member card. Staff scan the QR or type the code at check-in so laps land on this account. */
export function MemberCard({ name, code, large = false }: { name: string; code: string; large?: boolean }) {
  const qr = (
    <View style={styles.qr} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Qr value={`PKMEMBER:${code}`} size={large ? 240 : 96} />
    </View>
  );
  return (
    <View style={[styles.card, large && styles.large]}>
      {large && qr}
      <View style={large ? styles.textLarge : styles.text}>
        <Text style={styles.eyebrow}>PINNACLE KARTING · MEMBER</Text>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.code, large && { fontSize: 34 }]} accessibilityLabel={`Member code ${code.split('').join(' ')}`}>
          {formatMemberCode(code)}
        </Text>
      </View>
      {!large && qr}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: '#1a1f2b',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  large: { flexDirection: 'column', alignItems: 'center', paddingVertical: space.xl },
  text: { flex: 1, gap: 4 },
  textLarge: { alignItems: 'center', gap: 4 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: weight.regular, letterSpacing: 1.2 },
  name: { color: colors.text, fontSize: 20, fontWeight: weight.light },
  code: { color: colors.text, fontSize: 24, fontWeight: weight.thin, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  qr: { borderRadius: 8, overflow: 'hidden' },
});
