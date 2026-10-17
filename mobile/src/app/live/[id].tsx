import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LiveTrack } from '../../components/LiveTrack';
import { Button, ErrorBox, Eyebrow, Loading, Muted, Screen, StatusBadge } from '../../components/ui';
import { api, type Lap, type LeaderboardEntry } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isRace } from '../../lib/format';
import { useAsync, usePolling } from '../../lib/hooks';
import { colors, mono, radius, weight } from '../../lib/theme';

const gapText = (e: LeaderboardEntry) => (!e.gap ? '' : 'laps' in e.gap ? `+${e.gap.laps}L` : e.gap.display);

/** Session clock: time since the green flag. */
function Clock({ startedAt, running }: { startedAt: string | null; running: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return (
    <Text style={styles.clock} accessibilityLabel={`${Math.floor(s / 60)} minutes ${s % 60} seconds since the start`}>
      {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </Text>
  );
}

/** Live view: karts moving round the track map, plus a timing tower that updates as they cross the line. */
export default function LiveView() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const board = useAsync(() => api.sessionLeaderboard(id), [id]);
  const laps = useAsync(() => api.sessionLaps(id), [id]);
  const venues = useAsync(() => api.venues(), []);
  const status = board.data?.resultStatus;
  usePolling(
    () => {
      void board.reload();
      void laps.reload();
    },
    3000,
    status === 'live' || status === 'provisional',
  );

  const lastBy = useMemo(() => {
    const m = new Map<string, Lap>();
    for (const l of laps.data ?? []) m.set(l.participantId, l);
    return m;
  }, [laps.data]);

  if (board.error) return <Screen topInset={false}><ErrorBox message={board.error} onRetry={() => board.reload()} /></Screen>;
  if (!board.data) return <Loading />;
  const { session, entries, resultStatus } = board.data;
  const live = resultStatus === 'live';
  const track = venues.data?.flatMap((v) => v.tracks).find((t) => t.id === session.track.id);
  const isMine = (e: LeaderboardEntry) => !!me?.driver && e.driver?.id === me.driver.id;
  const fastestUs = Math.min(...entries.map((e) => e.bestLap?.us ?? Infinity));
  const leaderLaps = Math.max(0, ...entries.map((e) => e.lapsCompleted));
  const race = isRace(session.type);

  return (
    <Screen topInset={false}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>{session.track.name} · {session.venue.name}</Eyebrow>
          <Text style={styles.h1} numberOfLines={1}>{session.name}</Text>
          <Muted>
            Lap {leaderLaps} · {entries.length} karts
          </Muted>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={resultStatus} />
          <Clock startedAt={session.startedAt} running={live} />
        </View>
      </View>

      <LiveTrack mapPath={track?.mapPath ?? null} entries={entries} laps={laps.data ?? []} startedAt={session.startedAt} live={live} isMine={isMine} />
      <Muted style={{ fontSize: 12 }}>
        Times come from the timing line. Between crossings, kart positions are estimated from each kart's lap pace.
      </Muted>

      {!live && (
        <View style={styles.ended}>
          <Text style={styles.endedText}>{resultStatus === 'provisional' ? 'Chequered flag. Results are being checked.' : 'This session is over.'}</Text>
          <Button title="See full results" variant="secondary" onPress={() => router.replace(`/session/${id}`)} />
        </View>
      )}

      <View style={styles.tower} accessibilityLabel="Timing tower">
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.th, styles.posCol]}>P</Text>
          <Text style={[styles.th, { flex: 1 }]}>Driver</Text>
          <Text style={[styles.th, styles.timeCol]}>Last</Text>
          <Text style={[styles.th, styles.timeCol]}>{race ? 'Gap' : 'Best'}</Text>
        </View>
        {entries.map((e) => {
          const mine = isMine(e);
          const last = lastBy.get(e.participantId);
          const lastIsBest = !!last && !!e.bestLap && last.lapTime.us === e.bestLap.us;
          const lastColor = !last ? colors.muted : last.lapTime.us === fastestUs ? colors.purple : lastIsBest ? colors.success : colors.text;
          return (
            <View
              key={e.participantId}
              style={[styles.row, mine && styles.mine]}
              accessible
              accessibilityLabel={`${e.position ? `P${e.position}` : 'No time yet'}, ${e.driver?.name ?? e.teamName ?? ''}${mine ? ', you' : ''}, kart ${e.karts}, last lap ${last?.lapTime.display ?? 'none'}, best ${e.bestLap?.display ?? 'none'}`}
            >
              <Text style={[styles.pos, styles.posCol]}>{e.position ?? '–'}</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <View style={[styles.kart, mine && { backgroundColor: colors.accent }]}>
                  <Text style={[styles.kartText, mine && { color: colors.accentText }]}>{e.karts}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.driver?.name ?? e.teamName ?? '—'}
                    {mine ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.sub}>
                    {e.lapsCompleted} laps{!race && e.position && e.position > 1 ? ` · ${gapText(e)}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={[styles.time, styles.timeCol, { color: lastColor }]}>{last?.lapTime.display ?? '—'}</Text>
              <Text style={[styles.time, styles.timeCol, e.hasFastestLap && { color: colors.purple }]}>{race ? (e.position === 1 ? 'Leader' : gapText(e)) : (e.bestLap?.display ?? '—')}</Text>
            </View>
          );
        })}
      </View>
      <Muted style={{ fontSize: 12 }}>Purple = fastest lap of the session. Green = the driver's own best so far. Updates every 3 seconds.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  h1: { color: colors.text, fontSize: 24, fontWeight: weight.thin },
  clock: { color: colors.text, fontSize: 26, fontWeight: weight.thin, ...mono },
  ended: { gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.amber, backgroundColor: colors.surface },
  endedText: { color: colors.text, fontSize: 15, fontWeight: weight.light },
  tower: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  headRow: { borderTopWidth: 0, paddingVertical: 8, backgroundColor: colors.surface2 },
  th: { color: colors.muted, fontSize: 11, fontWeight: weight.regular, letterSpacing: 1, textTransform: 'uppercase' },
  mine: { backgroundColor: colors.mine },
  posCol: { width: 22, textAlign: 'center' },
  timeCol: { width: 64, textAlign: 'right' },
  pos: { color: colors.text, fontSize: 17, fontWeight: weight.light, ...mono },
  kart: { minWidth: 30, paddingHorizontal: 4, height: 24, borderRadius: 6, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  kartText: { color: colors.text, fontSize: 12, fontWeight: weight.medium, ...mono },
  name: { color: colors.text, fontSize: 15, fontWeight: weight.light },
  sub: { color: colors.muted, fontSize: 12, fontWeight: weight.regular },
  time: { color: colors.text, fontSize: 14, fontWeight: weight.regular, ...mono },
});
