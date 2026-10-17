import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { colors, mono, radius } from '../../lib/theme';
import { Button, Chips, Empty, ErrorBox, Loading, Muted, SectionTitle, Stat, StatGrid } from '../ui';

type Period = 'day' | 'week' | 'month' | 'all' | 'friends';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'week', label: 'This week' },
  { value: 'day', label: 'Today' },
  { value: 'all', label: 'All time' },
  { value: 'friends', label: 'Friends' },
];

interface Row {
  key: string;
  position: number;
  name: string;
  sub: string;
  time: string;
  gap: string;
  mine: boolean;
  sessionId: string;
}

/** Track records plus monthly/weekly/daily/all-time boards and a friends-only board. */
export function BoardsPanel({ refreshKey, trackId: fixedTrack }: { refreshKey: number; trackId?: string }) {
  const { me } = useAuth();
  const venues = useAsync(() => api.venues(), []);
  const tracks = (venues.data ?? []).flatMap((v) => v.tracks.map((t) => ({ value: t.id, label: `${v.name} · ${t.name}` })));
  const [chosenTrack, setTrackId] = useState('');
  const trackId = fixedTrack ?? chosenTrack;
  const [period, setPeriod] = useState<Period>('month');
  const [classId, setClassId] = useState('');
  useEffect(() => {
    if (!fixedTrack && !chosenTrack && tracks.length) setTrackId(tracks[0].value);
  }, [fixedTrack, chosenTrack, tracks]);

  const isFriends = period === 'friends';
  const board = useAsync(
    () => (trackId && !isFriends ? api.trackLeaderboard(trackId, period, classId || undefined) : Promise.resolve(null)),
    [trackId, period, classId, refreshKey],
  );
  const friends = useAsync(() => (trackId && isFriends && me?.driver ? api.friendsLeaderboard(trackId) : Promise.resolve(null)), [trackId, isFriends, me?.driver?.id, refreshKey]);
  const records = useAsync(() => (trackId ? api.trackRecords(trackId) : Promise.resolve([])), [trackId, refreshKey]);

  const rows: Row[] | null = isFriends
    ? (friends.data?.map((e) => ({
        key: e.driver.id,
        position: e.position,
        name: e.driver.name,
        sub: formatDate(e.setAt),
        time: e.lapTime.display,
        gap: e.gapUs ? `+${(e.gapUs / 1e6).toFixed(3)}` : '',
        mine: e.isYou,
        sessionId: e.sessionId,
      })) ?? null)
    : (board.data?.entries.map((e) => ({
        key: `${e.driver.id}-${e.kartClass?.name}`,
        position: e.position,
        name: e.driver.name,
        sub: `${e.kartClass ? `${e.kartClass.name} · ` : ''}${formatDate(e.setAt)}`,
        time: e.lapTime.display,
        gap: e.gapUs ? `+${(e.gapUs / 1e6).toFixed(3)}` : '',
        mine: me?.driver?.id === e.driver.id,
        sessionId: e.sessionId,
      })) ?? null);
  const err = isFriends ? friends.error : board.error;

  return (
    <>
      {!fixedTrack && tracks.length > 1 && <Chips options={tracks} value={trackId} onChange={(v) => { setTrackId(v); setClassId(''); }} />}
      {!!records.data?.length && (
        <StatGrid>
          {records.data.map((r, i) => (
            <Stat key={i} label={`Track record${r.kartClass ? ` · ${r.kartClass.name}` : ''}`} value={r.lapTime.display} hint={`${r.driver?.name ?? ''} · ${formatDate(r.setAt)}`} />
          ))}
        </StatGrid>
      )}
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {!isFriends && board.data && board.data.classesIncluded.length > 1 && (
        <Chips
          options={[{ value: '', label: 'All classes' }, ...board.data.classesIncluded.map((c) => ({ value: c.id ?? '', label: c.name ?? 'Unclassified' }))]}
          value={classId}
          onChange={setClassId}
        />
      )}
      {!isFriends && board.data?.note && <Muted>{board.data.note}</Muted>}

      <SectionTitle>{isFriends ? 'You and your friends' : 'Best lap per driver'}</SectionTitle>
      {isFriends && !me?.driver && (
        <>
          <Muted>Sign in to compare with friends.</Muted>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
        </>
      )}
      {err && <ErrorBox message={err} onRetry={() => (isFriends ? friends.reload() : board.reload())} />}
      {(isFriends ? friends.loading && !!me?.driver : board.loading) && <Loading />}
      {rows && rows.length === 0 && (
        <Empty>{isFriends ? 'No final laps yet from you or your friends here. Add friends from Me → Friends.' : 'No final results for this period yet.'}</Empty>
      )}
      {rows && rows.length > 0 && (
        <View style={styles.list}>
          {rows.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => router.push(`/session/${r.sessionId}`)}
              accessibilityRole="button"
              accessibilityLabel={`Position ${r.position}, ${r.name}, ${r.time}${r.mine ? ', you' : ''}`}
              style={({ pressed }) => [styles.row, r.mine && styles.mine, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.pos}>{r.position <= 3 ? ['🥇', '🥈', '🥉'][r.position - 1] : r.position}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.name}
                  {r.mine ? '  (you)' : ''}
                </Text>
                <Text style={styles.sub}>{r.sub}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.time}>{r.time}</Text>
                <Text style={styles.sub}>{r.gap}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <Muted style={{ fontSize: 12 }}>Only final results count. Each track layout has its own board; equal times rank by who set them first.</Muted>
    </>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, minHeight: 56 },
  mine: { backgroundColor: 'rgba(25,210,122,0.12)' },
  pos: { width: 28, color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center' },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12 },
  time: { color: colors.text, fontSize: 16, fontWeight: '700', ...mono },
});
