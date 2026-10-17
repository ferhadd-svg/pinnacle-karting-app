import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Lap, LeaderboardEntry } from '../lib/api';
import { pointAt, sampleTrack } from '../lib/trackPath';
import { colors, weight } from '../lib/theme';

const DEFAULT_LAP_MS = 45_000;

/** Re-render on a short interval while `on`, for smooth kart movement. */
function useNow(on: boolean, ms = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

export interface KartOnTrack {
  participantId: string;
  kart: string;
  mine: boolean;
  /** 0..1 of the lap since the last crossing. */
  fraction: number;
  /** No crossing for much longer than a lap: probably stopped or in the pits. */
  stale: boolean;
}

/**
 * Where each kart is now. The timing loop only reports crossings of the line, so positions between
 * crossings are estimated from each kart's own recent lap time.
 */
export function estimatePositions(entries: LeaderboardEntry[], laps: Lap[], startedAt: string | null, now: number, isMine: (e: LeaderboardEntry) => boolean): KartOnTrack[] {
  const byP = new Map<string, Lap[]>();
  for (const l of laps) byP.set(l.participantId, [...(byP.get(l.participantId) ?? []), l]);
  const bests = entries.map((e) => e.bestLap?.us).filter((v): v is number => !!v);
  const fieldMs = bests.length ? bests.sort((a, b) => a - b)[Math.floor(bests.length / 2)] / 1000 : DEFAULT_LAP_MS;
  const start = startedAt ? Date.parse(startedAt) : now;
  return entries.map((e, i) => {
    const mine = isMine(e);
    const own = byP.get(e.participantId) ?? [];
    const last = own[own.length - 1];
    if (!last) {
      // Out-lap: no completed lap yet. Spread karts out a little so they don't sit on top of each other.
      const f = ((now - start) / (fieldMs * 1.15) - i * 0.03 + 1) % 1;
      return { participantId: e.participantId, kart: e.karts ?? '?', mine, fraction: Math.max(0, f), stale: false };
    }
    const lapMs = last.lapTime.us / 1000 || fieldMs;
    const since = now - Date.parse(last.endedAt);
    return {
      participantId: e.participantId,
      kart: e.karts ?? '?',
      mine,
      fraction: Math.min(0.985, Math.max(0, since / lapMs)),
      stale: since > lapMs * 2.5,
    };
  });
}

/** Track map with karts moving round it in real time. */
export function LiveTrack({
  mapPath,
  entries,
  laps,
  startedAt,
  live,
  isMine,
}: {
  mapPath: string | null;
  entries: LeaderboardEntry[];
  laps: Lap[];
  startedAt: string | null;
  live: boolean;
  isMine: (e: LeaderboardEntry) => boolean;
}) {
  const { width } = useWindowDimensions();
  const track = useMemo(() => (mapPath ? sampleTrack(mapPath) : null), [mapPath]);
  const now = useNow(live);
  const box = useMemo(() => {
    if (!track) return null;
    const xs = track.points.map((p) => p.x);
    const ys = track.points.map((p) => p.y);
    const pad = 5;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
  }, [track]);
  if (!track || !box || !mapPath) return null;

  const karts = estimatePositions(entries, laps, startedAt, now, isMine).sort((a, b) => Number(a.mine) - Number(b.mine));
  const w = Math.min(width - 32, 560);
  const h = (w * box.h) / box.w;
  // Start/finish: a short line across the track at the path's first point.
  const p0 = track.points[0];
  const p1 = track.points[1];
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const nx = -(p1.y - p0.y) / len;
  const ny = (p1.x - p0.x) / len;

  return (
    <View style={styles.wrap}>
      <Svg width={w} height={h} viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`} accessibilityLabel={`Track map with ${karts.length} karts`}>
        <Path d={mapPath} stroke={colors.border} strokeWidth={6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path d={mapPath} stroke={colors.surface2} strokeWidth={4.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path d={mapPath} stroke={colors.muted} strokeWidth={0.25} fill="none" strokeDasharray="1.5 2" opacity={0.6} />
        <Line x1={p0.x - nx * 3.4} y1={p0.y - ny * 3.4} x2={p0.x + nx * 3.4} y2={p0.y + ny * 3.4} stroke={colors.text} strokeWidth={0.9} strokeDasharray="0.6 0.6" />
        <SvgText x={p0.x + nx * 4.5} y={p0.y + ny * 4.5 + 1} fontSize={2.6} fill={colors.muted} textAnchor="middle">
          START / FINISH
        </SvgText>
        {karts.map((k) => {
          const { x, y } = pointAt(track, k.fraction);
          const r = k.mine ? 2.9 : 2.3;
          return (
            <G key={k.participantId} opacity={k.stale ? 0.35 : 1}>
              <Circle cx={x} cy={y} r={r} fill={k.mine ? colors.accent : colors.text} stroke={colors.bg} strokeWidth={0.5} />
              <SvgText x={x} y={y + (k.mine ? 1 : 0.8)} fontSize={k.mine ? 2.6 : 2.1} fontWeight={weight.medium} fill={k.mine ? colors.accentText : colors.bg} textAnchor="middle">
                {k.kart}
              </SvgText>
              {k.mine && (
                <SvgText x={x} y={y - r - 1} fontSize={2.4} fontWeight={weight.medium} fill={colors.accent} textAnchor="middle">
                  YOU
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
        <Text style={styles.legendText}>You</Text>
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
        <Text style={styles.legendText}>Other karts (number on the dot)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.muted, fontSize: 12, fontWeight: weight.regular, marginRight: 8 },
});
