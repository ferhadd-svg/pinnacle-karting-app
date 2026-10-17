import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, type DriverSession, type SessionType } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, typeLabel } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { colors, weight } from '../../lib/theme';
import { Button, Card, Chips, Empty, ErrorBox, Loading, Muted, StatusBadge } from '../ui';

type Range = 'all' | '30d' | 'year';

/** The signed-in driver's sessions, filterable by track, session type, kart and date. */
export function MyResultsPanel({ refreshKey }: { refreshKey: number }) {
  const { me } = useAuth();
  const driverId = me?.driver?.id;
  const history = useAsync(() => (driverId ? api.driverSessions(driverId) : Promise.resolve([])), [driverId, refreshKey]);
  const all = history.data ?? [];
  const [trackId, setTrackId] = useState('');
  const [type, setType] = useState<'' | SessionType>('');
  const [kart, setKart] = useState('');
  const [range, setRange] = useState<Range>('all');

  if (!driverId) {
    return (
      <Card>
        <Text style={styles.title}>See every race you've driven</Text>
        <Muted>Sign in and show your member card at check-in. Your results appear here automatically.</Muted>
        <Button title="Sign in or create account" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }

  const tracks = [...new Map(all.map((s) => [s.track.id, `${s.venue.name} · ${s.track.name}`])).entries()];
  const karts = [...new Set(all.flatMap((s) => (s.karts ?? '').split(', ').filter(Boolean)))].sort((a, b) => Number(a) - Number(b));
  const types = [...new Set(all.map((s) => s.session.type))];
  const since = range === '30d' ? Date.now() - 30 * 86_400_000 : range === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : 0;
  const filtered = all.filter(
    (s) =>
      (!trackId || s.track.id === trackId) &&
      (!type || s.session.type === type) &&
      (!kart || (s.karts ?? '').split(', ').includes(kart)) &&
      new Date(s.session.startedAt).getTime() >= since,
  );

  return (
    <>
      {tracks.length > 1 && <Chips options={[{ value: '', label: 'All tracks' }, ...tracks.map(([value, label]) => ({ value, label }))]} value={trackId} onChange={setTrackId} />}
      {types.length > 1 && <Chips options={[{ value: '' as const, label: 'All types' }, ...types.map((t) => ({ value: t, label: typeLabel[t] }))]} value={type} onChange={setType} />}
      {karts.length > 1 && <Chips options={[{ value: '', label: 'Any kart' }, ...karts.map((k) => ({ value: k, label: `Kart ${k}` }))]} value={kart} onChange={setKart} />}
      <Chips
        options={[
          { value: 'all' as const, label: 'All time' },
          { value: 'year' as const, label: 'This year' },
          { value: '30d' as const, label: 'Last 30 days' },
        ]}
        value={range}
        onChange={setRange}
      />
      {history.error && <ErrorBox message={history.error} onRetry={() => history.reload()} />}
      {history.loading && <Loading />}
      {history.data && filtered.length === 0 && (
        <Empty>{all.length ? 'No sessions match these filters.' : 'No races yet. Show your member card at check-in and your laps will appear here.'}</Empty>
      )}
      {filtered.map((s) => (
        <HistoryRow key={s.session.id} s={s} />
      ))}
    </>
  );
}

function HistoryRow({ s }: { s: DriverSession }) {
  return (
    <Card onPress={() => router.push(`/session/${s.session.id}`)}>
      <View style={styles.head}>
        <Text style={styles.position}>{s.position ? `P${s.position}` : '—'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {s.session.name}
          </Text>
          <Muted>
            {typeLabel[s.session.type]} · {s.track.name} · {formatDate(s.session.startedAt)}
          </Muted>
        </View>
        <StatusBadge status={s.session.resultStatus} />
      </View>
      <Muted>
        {s.laps} laps · best {s.bestLap?.display ?? '—'} · avg {s.averageLap?.display ?? '—'} · kart {s.karts}
      </Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 15, fontWeight: weight.light },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  position: { color: colors.text, fontSize: 22, fontWeight: weight.thin, width: 44 },
});
