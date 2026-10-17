import { StyleSheet, Text, View } from 'react-native';
import type { Lap } from '../lib/api';
import { colors, mono } from '../lib/theme';

/** Lap-by-lap bars: best valid lap in purple, laps not counted for best times marked. */
export function LapBars({ laps }: { laps: Lap[] }) {
  if (!laps.length) return null;
  const valid = laps.filter((l) => l.valid).map((l) => l.lapTime.us);
  const best = valid.length ? Math.min(...valid) : null;
  const lo = Math.min(...laps.map((l) => l.lapTime.us));
  const span = Math.max(Math.max(...laps.map((l) => l.lapTime.us)) - lo, 1);
  return (
    <View style={{ gap: 6 }}>
      {laps.map((l) => {
        const isBest = l.valid && l.lapTime.us === best;
        const tag = l.valid ? null : l.flags.includes('pit') ? 'PIT' : l.flags.includes('start_lap') ? 'START' : '✕';
        return (
          <View
            key={`${l.participantId}-${l.lapNumber}`}
            style={styles.row}
            accessible
            accessibilityLabel={`Lap ${l.lapNumber}, ${l.lapTime.display}${isBest ? ', best lap' : ''}${l.valid ? '' : `, not counted: ${l.invalidReason ?? l.flags.join(', ')}`}`}
          >
            <Text style={styles.label}>L{l.lapNumber}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  { width: `${25 + ((l.lapTime.us - lo) / span) * 75}%` },
                  isBest && { backgroundColor: colors.purple },
                  !l.valid && { backgroundColor: colors.border },
                ]}
              />
            </View>
            <Text style={[styles.value, isBest && { color: colors.purple, fontWeight: '700' }]}>{l.lapTime.display}</Text>
            <Text style={styles.tag}>{tag ?? ''}</Text>
          </View>
        );
      })}
      <Text style={styles.legend}>Purple = best lap · PIT = pit lap · START = lap from the race start · ✕ = not counted for best times</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.muted, width: 30, fontSize: 12 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5, backgroundColor: colors.muted },
  value: { color: colors.text, width: 70, textAlign: 'right', fontSize: 13, ...mono },
  tag: { color: colors.amber, width: 40, fontSize: 10, fontWeight: '700' },
  legend: { color: colors.muted, fontSize: 11, marginTop: 4 },
});
