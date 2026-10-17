import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LapBars } from '../../components/LapBars';
import { Button, Eyebrow, ErrorBox, Loading, Muted, Screen, SectionTitle, StatusBadge, StatusNote } from '../../components/ui';
import { YourRace } from '../../components/YourRace';
import { api, type Lap, type LeaderboardEntry } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime, isRace, typeLabel } from '../../lib/format';
import { useAsync, usePolling } from '../../lib/hooks';
import { colors, mono, radius, weight } from '../../lib/theme';

const gapText = (e: LeaderboardEntry) => (!e.gap ? '' : 'laps' in e.gap ? `+${e.gap.laps} lap${e.gap.laps > 1 ? 's' : ''}` : e.gap.display);

export default function SessionScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const board = useAsync(() => api.sessionLeaderboard(id), [id]);
  const laps = useAsync(() => api.sessionLaps(id), [id]);
  const pbs = useAsync(() => (me?.driver ? api.personalBests(me.driver.id) : Promise.resolve([])), [me?.driver?.id]);
  const [open, setOpen] = useState<string | null>(null);

  // Live and provisional results refresh every 3 s while this screen is open.
  const status = board.data?.resultStatus;
  usePolling(
    () => {
      void board.reload();
      void laps.reload();
    },
    3000,
    status === 'live' || status === 'provisional',
  );

  const lapsBy = useMemo(() => {
    const m = new Map<string, Lap[]>();
    for (const l of laps.data ?? []) m.set(l.participantId, [...(m.get(l.participantId) ?? []), l]);
    return m;
  }, [laps.data]);

  if (board.error) return <Screen topInset={false}><ErrorBox message={board.error} onRetry={() => board.reload()} /></Screen>;
  if (!board.data) return <Loading />;
  const { session, entries, resultStatus } = board.data;
  const race = isRace(session.type);

  return (
    <Screen topInset={false} onRefresh={() => Promise.all([board.reload({ pull: true }), laps.reload()])} refreshing={board.refreshing}>
      <Stack.Screen options={{ title: session.name }} />
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>
            {typeLabel[session.type]} · {session.track.name}
          </Eyebrow>
          <Text style={styles.h1}>{session.name}</Text>
          <Muted>
            {session.venue.name} · {formatDateTime(session.startedAt, session.venue.timezone)}
            {session.kartClass ? ` · ${session.kartClass.name}` : ''}
          </Muted>
        </View>
        <StatusBadge status={resultStatus} />
      </View>
      <StatusNote status={resultStatus} />
      {resultStatus === 'live' && <Button title="Watch live on the track map" onPress={() => router.push(`/live/${id}`)} />}

      {me?.driver && laps.data && (
        <YourRace sessionId={id} myDriverId={me.driver.id} entries={entries} laps={laps.data} resultStatus={resultStatus} personalBests={pbs.data ?? []} />
      )}

      <SectionTitle>{race ? 'Race result' : 'Standings'}</SectionTitle>
      <View style={styles.table}>
        {entries.map((e) => {
          const expanded = open === e.participantId;
          const mine = !!me?.driver && (e.driver?.id === me.driver.id || (lapsBy.get(e.participantId) ?? []).some((l) => l.driver?.id === me.driver?.id));
          return (
            <View key={e.participantId} style={styles.rowWrap}>
              <Pressable
                onPress={() => setOpen(expanded ? null : e.participantId)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${e.disqualified ? 'Disqualified' : e.position ? `Position ${e.position}` : 'Unclassified'}, ${e.teamName ?? e.driver?.name ?? ''}, kart ${e.karts}, best lap ${e.bestLap?.display ?? 'none'}, ${e.lapsCompleted} laps${e.hasFastestLap ? ', fastest lap' : ''}`}
                style={({ pressed }) => [styles.row, mine && styles.mine, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.pos}>{e.disqualified ? 'DQ' : (e.position ?? '—')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.teamName ?? e.driver?.name ?? '—'}
                    {mine ? '  (you)' : ''}
                  </Text>
                  <Text style={styles.sub}>
                    Kart {e.karts} · {e.lapsCompleted} laps{e.averageLap ? ` · avg ${e.averageLap.display}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.time, e.hasFastestLap && { color: colors.purple }]}>{e.bestLap?.display ?? '—'}</Text>
                  <Text style={styles.sub}>{e.position === 1 ? (race ? 'Winner' : 'Fastest') : gapText(e)}</Text>
                </View>
              </Pressable>
              {expanded && (
                <View style={styles.detail}>
                  <LapBars laps={lapsBy.get(e.participantId) ?? []} />
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Muted style={{ fontSize: 12 }}>Tap a driver for lap-by-lap times. Purple = fastest lap of the session.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  h1: { color: colors.text, fontSize: 24, fontWeight: weight.thin },
  table: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  rowWrap: { borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, minHeight: 60 },
  mine: { backgroundColor: colors.mine },
  pos: { width: 30, color: colors.text, fontWeight: weight.light, fontSize: 18, textAlign: 'center' },
  name: { color: colors.text, fontSize: 15, fontWeight: weight.light },
  sub: { color: colors.muted, fontSize: 12 },
  time: { color: colors.text, fontSize: 16, fontWeight: weight.light, ...mono },
  detail: { padding: 12, backgroundColor: colors.bg },
});
