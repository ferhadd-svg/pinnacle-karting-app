import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { LineChart } from '../../components/LineChart';
import { MemberCard } from '../../components/MemberCard';
import { Button, Card, Chips, Empty, ErrorBox, H1, Loading, Muted, Screen, SectionTitle, Stat, StatGrid } from '../../components/ui';
import { api, type DriverSession } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatLap } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { colors, mono } from '../../lib/theme';

export default function MeScreen() {
  const { me, ready, signOut, refresh } = useAuth();
  if (!ready) return <Loading />;
  if (!me) {
    return (
      <Screen>
        <H1>Your racing</H1>
        <Card>
          <Text style={styles.title}>Sign in to see your laps</Text>
          <Muted>Your sessions, lap-by-lap times, personal bests and progress, from every visit.</Muted>
          <Button title="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </Card>
      </Screen>
    );
  }
  if (!me.driver) {
    return (
      <Screen>
        <H1>{me.email}</H1>
        <Muted>Staff account ({me.role}). Use the operator console on the web to run sessions.</Muted>
        <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
      </Screen>
    );
  }
  return <DriverProfile driver={me.driver} onSignOut={() => void signOut()} onChanged={refresh} />;
}

function DriverProfile({
  driver,
  onSignOut,
  onChanged,
}: {
  driver: { id: string; name: string; memberCode: string; showOnLeaderboards: boolean };
  onSignOut: () => void;
  onChanged: () => Promise<void>;
}) {
  const history = useAsync(() => api.driverSessions(driver.id), [driver.id]);
  const pbs = useAsync(() => api.personalBests(driver.id), [driver.id]);
  const waivers = useAsync(() => api.myWaivers(), [driver.id]);
  const waiverOk = (waivers.data ?? []).every((w) => w.valid);
  const w0 = waivers.data?.[0];
  const waiverText = !waivers.data ? 'Loading…' : waiverOk && w0?.expiresAt ? `Signed · valid until ${formatDate(w0.expiresAt)}` : 'Not signed: sign before your next race';
  const all = history.data ?? [];

  const finals = all.filter((s) => s.session.resultStatus === 'final');
  const totalLaps = all.reduce((n, s) => n + s.laps, 0);

  return (
    <Screen onRefresh={() => Promise.all([history.reload({ pull: true }), pbs.reload(), waivers.reload()])} refreshing={history.refreshing}>
      <H1>{driver.name}</H1>
      <Card onPress={() => router.push('/card')} style={{ padding: 0, borderWidth: 0, backgroundColor: 'transparent' }}>
        <MemberCard name={driver.name} code={driver.memberCode} />
      </Card>
      <Muted style={{ fontSize: 12 }}>Tap the card to show it full screen at check-in.</Muted>

      <StatGrid>
        <Stat label="Sessions" value={String(all.length)} />
        <Stat label="Laps" value={String(totalLaps)} />
        <Stat label="Wins" value={String(finals.filter((s) => s.position === 1).length)} />
        <Stat label="Podiums" value={String(finals.filter((s) => s.position !== null && s.position <= 3).length)} />
      </StatGrid>

      {history.error && <ErrorBox message={history.error} onRetry={() => history.reload()} />}
      {history.loading && <Loading />}

      <Progress sessions={all} />

      <SectionTitle>Personal bests</SectionTitle>
      {pbs.data && pbs.data.length === 0 && <Empty>Personal bests appear once a session you drove in is finalised.</Empty>}
      <StatGrid>
        {(pbs.data ?? []).map((pb) => (
          <Stat key={`${pb.track.id}-${pb.kartClass?.id}`} label={`${pb.track.name}${pb.kartClass ? ` · ${pb.kartClass.name}` : ''}`} value={pb.lapTime.display} hint={formatDate(pb.setAt)} />
        ))}
      </StatGrid>

      <KartStats sessions={all} />

      <SectionTitle>Account</SectionTitle>
      <LinkRow title="Waiver" subtitle={waiverText} onPress={() => router.push('/waiver')} warn={!!waivers.data && !waiverOk} />
      <LinkRow title="Friends" subtitle="Add friends by member code and compare lap times" onPress={() => router.push('/friends')} />
      <LinkRow title="My results" subtitle="Every session, with filters" onPress={() => router.push('/race?tab=mine')} />
      <LinkRow title="Receipts" subtitle="Ticket purchases" onPress={() => router.push('/receipts')} />

      <SectionTitle>Settings</SectionTitle>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Show me on public leaderboards</Text>
            <Muted>When off, others see "Private driver". You always see your own results.</Muted>
          </View>
          <Switch
            value={driver.showOnLeaderboards}
            onValueChange={async (v) => {
              await api.updateMyDriver({ showOnLeaderboards: v });
              await onChanged();
            }}
            trackColor={{ true: colors.you, false: colors.border }}
            accessibilityLabel="Show me on public leaderboards"
          />
        </View>
      </Card>
      <Button title="Sign out" variant="danger" onPress={onSignOut} />
    </Screen>
  );
}

/** Best lap per session over time, for one track (comparing tracks would be meaningless). */
function Progress({ sessions }: { sessions: DriverSession[] }) {
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

/** Your fastest lap and session count per kart number. */
function KartStats({ sessions }: { sessions: DriverSession[] }) {
  const byKart = new Map<string, { best: number; count: number }>();
  for (const s of sessions) {
    const karts = (s.karts ?? '').split(', ').filter(Boolean);
    if (karts.length !== 1 || !s.bestLap) continue; // skip kart swaps: the best lap can't be attributed
    const k = byKart.get(karts[0]) ?? { best: Infinity, count: 0 };
    byKart.set(karts[0], { best: Math.min(k.best, s.bestLap.us), count: k.count + 1 });
  }
  const rows = [...byKart.entries()].sort((a, b) => a[1].best - b[1].best);
  if (rows.length < 2) return null;
  return (
    <>
      <SectionTitle>Your karts</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {rows.map(([kart, r], i) => (
          <View key={kart} style={[styles.kartRow, i > 0 && styles.divider]} accessible accessibilityLabel={`Kart ${kart}: best ${formatLap(r.best)} over ${r.count} sessions`}>
            <Text style={styles.title}>Kart {kart}</Text>
            <Muted style={{ flex: 1 }}>
              {r.count} session{r.count > 1 ? 's' : ''}
            </Muted>
            <Text style={[styles.time, i === 0 && { color: colors.purple }]}>{formatLap(r.best)}</Text>
          </View>
        ))}
      </Card>
      <Muted style={{ fontSize: 12 }}>Your best lap in each kart. Mixed tracks and conditions included, so treat it as a rough guide.</Muted>
    </>
  );
}

function LinkRow({ title, subtitle, onPress, warn }: { title: string; subtitle: string; onPress: () => void; warn?: boolean }) {
  return (
    <Card onPress={onPress} style={warn ? { borderColor: colors.amber } : undefined}>
      <View style={styles.linkRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Muted style={warn ? { color: colors.amber } : undefined}>{subtitle}</Muted>
        </View>
        <Icon name="chevron" color={colors.muted} size={20} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kartRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  time: { color: colors.text, fontSize: 16, fontWeight: '700', ...mono },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
