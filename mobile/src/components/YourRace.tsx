import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Lap, LeaderboardEntry, PersonalBest, ResultStatus } from '../lib/api';
import { formatDelta, formatLap } from '../lib/format';
import { colors, mono, radius, space, weight } from '../lib/theme';
import { LapBars } from './LapBars';
import { LineChart } from './LineChart';
import { Card, Chips, Eyebrow, Muted, Stat, StatGrid } from './ui';

const entryName = (e: LeaderboardEntry) => e.teamName ?? e.driver?.name ?? `Kart ${e.karts}`;

function stdDev(v: number[]) {
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1));
}

interface Props {
  sessionId: string;
  myDriverId: string;
  entries: LeaderboardEntry[];
  laps: Lap[];
  resultStatus: ResultStatus;
  personalBests: PersonalBest[];
}

/** The signed-in driver's own result: position, insights, PB badge and a head-to-head with any rival. */
export function YourRace({ sessionId, myDriverId, entries, laps, resultStatus, personalBests }: Props) {
  // A team entry is "mine" if I drove any of its laps.
  const mine = entries.find((e) => e.driver?.id === myDriverId || laps.some((l) => l.participantId === e.participantId && l.driver?.id === myDriverId));
  const others = entries.filter((e) => e !== mine && e.lapsCompleted > 0);
  const nearest =
    mine && (others.find((e) => e.position === (mine.position ?? 0) - 1) ?? others.find((e) => e.position === (mine.position ?? 0) + 1) ?? others[0]);
  const [rivalId, setRivalId] = useState<string>(nearest?.participantId ?? '');

  const myLaps = useMemo(
    () => (mine ? laps.filter((l) => l.participantId === mine.participantId && (!mine.teamName || l.driver?.id === myDriverId)) : []),
    [laps, mine, myDriverId],
  );
  if (!mine) return null;

  const valid = myLaps.filter((l) => l.valid).map((l) => l.lapTime.us);
  const best = valid.length ? Math.min(...valid) : null;
  const avg = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
  const spread = stdDev(valid);
  const allValid = laps.filter((l) => l.valid).map((l) => l.lapTime.us);
  const fastest = allValid.length ? Math.min(...allValid) : null;
  const isPb = resultStatus === 'final' && best !== null && personalBests.some((pb) => pb.sessionId === sessionId && pb.lapTime.us === best);
  const bestLapNo = myLaps.find((l) => l.valid && l.lapTime.us === best)?.lapNumber;
  const rival = entries.find((e) => e.participantId === (rivalId || nearest?.participantId));
  const rivalLaps = rival ? laps.filter((l) => l.participantId === rival.participantId) : [];

  return (
    <Card accent>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Eyebrow>{mine.teamName ? `Your stints · ${mine.teamName}` : 'Your result'}</Eyebrow>
          <Text style={styles.position} accessibilityRole="header">
            {mine.position ? `P${mine.position}` : mine.disqualified ? 'DQ' : '—'}
            <Text style={styles.of}> of {entries.length}</Text>
          </Text>
        </View>
        {isPb && (
          <View style={styles.pb} accessible accessibilityLabel="New personal best">
            <Text style={styles.pbText}>★ NEW PB</Text>
          </View>
        )}
      </View>

      <StatGrid>
        <Stat label={`Best lap${bestLapNo ? ` · L${bestLapNo}` : ''}`} value={best ? formatLap(best) : '—'} highlight={best !== null && best === fastest} />
        <Stat label="Average" value={avg ? formatLap(avg) : '—'} />
        <Stat label="Consistency" value={spread !== null ? `±${(spread / 1e6).toFixed(3)}s` : '—'} hint="lap-to-lap spread" />
        <Stat label="To fastest lap" value={best === null || fastest === null ? '—' : best === fastest ? 'Fastest!' : formatDelta(best - fastest)} />
      </StatGrid>

      <LapBars laps={myLaps} />

      {others.length > 0 && rival && (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Text style={styles.subhead}>Head-to-head</Text>
          <Chips
            value={rival.participantId}
            onChange={setRivalId}
            options={others.map((e) => ({ value: e.participantId, label: `${e.position ? `P${e.position} ` : ''}${entryName(e)}` }))}
          />
          <HeadToHead you={myLaps} them={rivalLaps} theirName={entryName(rival)} />
        </View>
      )}
    </Card>
  );
}

function HeadToHead({ you, them, theirName }: { you: Lap[]; them: Lap[]; theirName: string }) {
  const rows = Array.from({ length: Math.max(you.length, them.length) }, (_, i) => {
    const a = you.find((l) => l.lapNumber === i + 1);
    const b = them.find((l) => l.lapNumber === i + 1);
    return { lap: i + 1, a, b, delta: a && b ? a.lapTime.us - b.lapTime.us : null };
  });
  const compared = rows.filter((r) => r.delta !== null);
  const won = compared.filter((r) => (r.delta ?? 0) < 0).length;
  const total = compared.reduce((s, r) => s + (r.delta ?? 0), 0);

  return (
    <View style={{ gap: space.sm }}>
      <LineChart
        label={`Lap times, you versus ${theirName}`}
        formatX={(x) => `Lap ${x}`}
        formatY={formatLap}
        series={[
          { name: 'You', color: colors.series1, points: you.map((l) => ({ x: l.lapNumber, y: l.lapTime.us })) },
          { name: theirName, color: colors.series2, points: them.map((l) => ({ x: l.lapNumber, y: l.lapTime.us })) },
        ]}
      />
      <Muted>
        You were quicker on {won} of {compared.length} laps · {formatDelta(total)}s overall
      </Muted>
      <View style={styles.table} accessibilityRole="list">
        <View style={[styles.tr, styles.th]}>
          <Text style={[styles.td, styles.tdLap, styles.thText]}>Lap</Text>
          <Text style={[styles.td, styles.thText]}>You</Text>
          <Text style={[styles.td, styles.thText]} numberOfLines={1}>
            {theirName}
          </Text>
          <Text style={[styles.td, styles.thText]}>Δ</Text>
        </View>
        {rows.map((r) => (
          <View
            key={r.lap}
            style={styles.tr}
            accessible
            accessibilityLabel={`Lap ${r.lap}: you ${r.a?.lapTime.display ?? 'no lap'}, ${theirName} ${r.b?.lapTime.display ?? 'no lap'}${
              r.delta === null ? '' : `, ${r.delta < 0 ? 'you were faster by' : r.delta > 0 ? 'you were slower by' : 'equal,'} ${(Math.abs(r.delta) / 1e6).toFixed(3)} seconds`
            }`}
          >
            <Text style={[styles.td, styles.tdLap]}>{r.lap}</Text>
            <Text style={styles.td}>{r.a?.lapTime.display ?? '—'}</Text>
            <Text style={styles.td}>{r.b?.lapTime.display ?? '—'}</Text>
            <Text style={styles.td}>
              {r.delta !== null && r.delta !== 0 && <Text style={{ color: r.delta < 0 ? colors.success : colors.danger }}>{r.delta < 0 ? '▲ ' : '▼ '}</Text>}
              {r.delta === null ? '—' : formatDelta(r.delta)}
            </Text>
          </View>
        ))}
      </View>
      <Muted style={{ fontSize: 12 }}>Δ = your lap minus theirs. ▲ you were faster, ▼ slower.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  position: { color: colors.text, fontSize: 40, fontWeight: weight.thin, letterSpacing: -1 },
  of: { color: colors.muted, fontSize: 18, fontWeight: weight.light },
  pb: { backgroundColor: colors.purple, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pbText: { color: '#fff', fontWeight: weight.regular, fontSize: 12, letterSpacing: 0.5 },
  subhead: { color: colors.text, fontWeight: weight.light, fontSize: 16 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.border },
  th: { borderTopWidth: 0, backgroundColor: colors.surface2 },
  thText: { color: colors.muted, fontSize: 11, fontWeight: weight.regular, textTransform: 'uppercase' },
  td: { flex: 1, color: colors.text, fontSize: 13, textAlign: 'right', ...mono },
  tdLap: { flex: 0.5, textAlign: 'left', color: colors.muted },
});
