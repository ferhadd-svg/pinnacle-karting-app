import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DriverSession } from '../lib/api';
import { formatLap } from '../lib/format';
import { colors, mono, weight } from '../lib/theme';
import { LineChart } from './LineChart';
import { Card, Chips, Muted, SectionTitle } from './ui';

/** Best lap per session over time, for one track (comparing tracks would be meaningless). */
export function Progress({ sessions }: { sessions: DriverSession[] }) {
  const tracks = [...new Map(sessions.filter((s) => s.bestLap).map((s) => [s.track.id, s.track.name])).entries()];
  const [trackId, setTrackId] = useState('');
  const current = trackId || tracks[0]?.[0];
  const points = useMemo(
    () =>
      sessions
        .filter((s) => s.track.id === current && s.bestLap)
        .map((s) => ({ x: new Date(s.session.startedAt).getTime(), y: s.bestLap!.us }))
        .sort((a, b) => a.x - b.x),
    [sessions, current],
  );
  if (points.length < 2) return null;
  const bestIdx = points.reduce((b, p, i) => (p.y < points[b].y ? i : b), 0);
  const first = points[0].y;
  const best = points[bestIdx].y;

  return (
    <>
      <SectionTitle>Progress</SectionTitle>
      {tracks.length > 1 && <Chips options={tracks.map(([value, label]) => ({ value, label }))} value={current} onChange={setTrackId} />}
      <Card>
        <Muted>
          Best lap each session{best < first ? ` · ${((first - best) / 1e6).toFixed(3)}s faster than your first visit` : ''}. Lower is faster.
        </Muted>
        <LineChart
          label={`Your best lap per session on ${tracks.find((t) => t[0] === current)?.[1] ?? 'this track'}`}
          formatX={(x) => new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          formatY={formatLap}
          series={[{ name: 'Best lap', color: colors.series1, points, highlight: { index: bestIdx, label: `PB ${formatLap(best)}` } }]}
        />
      </Card>
    </>
  );
}

/**
 * Your fastest lap and session count per kart, grouped by venue: kart numbers are only meaningful within
 * one venue, and lap times only compare on the same track.
 */
export function KartStats({ sessions }: { sessions: DriverSession[] }) {
  const byVenue = new Map<string, { venue: string; karts: Map<string, { best: number; count: number }> }>();
  for (const s of sessions) {
    const karts = (s.karts ?? '').split(', ').filter(Boolean);
    if (karts.length !== 1 || !s.bestLap) continue; // skip kart swaps: the best lap can't be attributed
    const v = byVenue.get(s.venue.id) ?? { venue: s.venue.name.replace(/^Pinnacle (Karting )?/, ''), karts: new Map() };
    const k = v.karts.get(karts[0]) ?? { best: Infinity, count: 0 };
    v.karts.set(karts[0], { best: Math.min(k.best, s.bestLap.us), count: k.count + 1 });
    byVenue.set(s.venue.id, v);
  }
  const groups = [...byVenue.values()].filter((g) => g.karts.size > 1);
  if (!groups.length) return null;
  return (
    <>
      <SectionTitle>Your karts</SectionTitle>
      {groups.map((g) => {
        const rows = [...g.karts.entries()].sort((a, b) => a[1].best - b[1].best);
        return (
          <Card key={g.venue} style={{ gap: 0, paddingVertical: 4 }}>
            <Text style={styles.venue}>{g.venue}</Text>
            {rows.map(([kart, r], i) => (
              <View key={kart} style={[styles.kartRow, i > 0 && styles.divider]} accessible accessibilityLabel={`${g.venue} kart ${kart}: best ${formatLap(r.best)} over ${r.count} sessions`}>
                <Text style={styles.title}>Kart {kart}</Text>
                <Muted style={{ flex: 1 }}>
                  {r.count} session{r.count > 1 ? 's' : ''}
                </Muted>
                <Text style={[styles.time, i === 0 && { color: colors.purple }]}>{formatLap(r.best)}</Text>
              </View>
            ))}
          </Card>
        );
      })}
      <Muted style={{ fontSize: 12 }}>Your best lap in each kart at each venue. Conditions vary, so treat it as a rough guide.</Muted>
    </>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 15, fontWeight: weight.light },
  venue: { color: colors.muted, fontSize: 12, fontWeight: weight.regular, letterSpacing: 1, textTransform: 'uppercase', paddingTop: 10 },
  kartRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  time: { color: colors.text, fontSize: 16, fontWeight: weight.light, ...mono },
});
