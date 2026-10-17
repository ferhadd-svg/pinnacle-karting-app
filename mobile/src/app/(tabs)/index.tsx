import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { SessionRow } from '../../components/SessionRow';
import { Button, Card, Empty, Eyebrow, H1, Muted, Screen, SectionTitle, Stat, StatGrid, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatDelta, formatMemberCode } from '../../lib/format';
import { useAsync, usePolling } from '../../lib/hooks';
import { colors, radius } from '../../lib/theme';

function QuickAction({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label} style={({ pressed }) => [styles.qa, pressed && { opacity: 0.7 }]}>
      <View style={styles.qaIcon}>
        <Icon name={icon} color={colors.text} />
      </View>
      <Text style={styles.qaLabel} numberOfLines={1}>
        {label}
      </Text>
      {badge ? <Text style={styles.qaBadge}>{badge}</Text> : null}
    </Pressable>
  );
}

export default function Home() {
  const { me } = useAuth();
  const driverId = me?.driver?.id;
  const sessions = useAsync(() => api.sessions({ limit: 20 }), []);
  const history = useAsync(() => (driverId ? api.driverSessions(driverId) : Promise.resolve([])), [driverId]);
  const pbs = useAsync(() => (driverId ? api.personalBests(driverId) : Promise.resolve([])), [driverId]);
  const tickets = useAsync(() => (driverId ? api.myTickets() : Promise.resolve([])), [driverId]);
  const rewards = useAsync(() => (driverId ? api.rewards() : Promise.resolve(null)), [driverId]);
  const waivers = useAsync(() => (driverId ? api.myWaivers() : Promise.resolve([])), [driverId]);
  usePolling(() => void sessions.reload(), 15_000, true);

  const refresh = () =>
    Promise.all([sessions.reload({ pull: true }), history.reload(), pbs.reload(), tickets.reload(), rewards.reload(), waivers.reload()]);
  const live = (sessions.data ?? []).filter((s) => s.resultStatus === 'live');
  const activeTickets = (tickets.data ?? []).filter((t) => t.status === 'active').length;
  const needsWaiver = (waivers.data ?? []).some((w) => !w.valid);
  const last = history.data?.[0];
  const lastPb = last && pbs.data?.find((p) => p.track.id === last.track.id);

  return (
    <Screen onRefresh={refresh} refreshing={sessions.refreshing}>
      <Eyebrow>Pinnacle Karting</Eyebrow>
      <H1>{me?.driver ? `Hi, ${me.driver.name.split(' ')[0]}` : 'Ready to race?'}</H1>

      {me?.driver ? (
        <Pressable
          onPress={() => router.push('/card')}
          accessibilityRole="button"
          accessibilityLabel={`Check in. Member code ${me.driver.memberCode.split('').join(' ')}. Opens your QR code.`}
          style={({ pressed }) => [styles.checkin, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.checkinIcon}>
            <Icon name="qr" color="#fff" size={30} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkinTitle}>Check in</Text>
            <Text style={styles.checkinSub}>Show your QR at the desk</Text>
            <Text style={styles.checkinCode}>{formatMemberCode(me.driver.memberCode)}</Text>
          </View>
          <Icon name="chevron" color="#fff" size={22} />
        </Pressable>
      ) : (
        <Card>
          <Text style={styles.cardTitle}>Your laps, tickets and rewards in one app</Text>
          <Muted>Create a free account to check in with a QR code, buy sessions, collect tokens and keep every lap time.</Muted>
          <Button title="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </Card>
      )}

      {me?.driver && needsWaiver && (
        <Card onPress={() => router.push('/waiver')} style={{ borderColor: colors.amber }}>
          <Text style={[styles.cardTitle, { color: colors.amber }]}>Sign your waiver before you race</Text>
          <Muted>It takes a minute and saves time at the desk. Tap to read and sign.</Muted>
        </Card>
      )}

      {me?.driver && (
        <View style={styles.qaRow}>
          <QuickAction icon="ticket" label="Tickets" badge={activeTickets ? `${activeTickets} ready` : undefined} onPress={() => router.push('/tickets')} />
          <QuickAction icon="gift" label="Rewards" badge={rewards.data ? `${rewards.data.balance} tokens` : undefined} onPress={() => router.push('/rewards')} />
          <QuickAction icon="trophy" label="Ranks" onPress={() => router.push('/race?tab=boards')} />
        </View>
      )}

      {live.length > 0 && (
        <>
          <SectionTitle>On track now</SectionTitle>
          {live.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </>
      )}

      {last && (
        <>
          <SectionTitle>My last race</SectionTitle>
          <Card onPress={() => router.push(`/session/${last.session.id}`)}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{last.session.name}</Text>
                <Muted>
                  {last.track.name} · {formatDate(last.session.startedAt)} · kart {last.karts}
                </Muted>
              </View>
              <StatusBadge status={last.session.resultStatus} />
            </View>
            <StatGrid>
              <Stat label="Position" value={last.position ? `P${last.position}/${last.fieldSize}` : '—'} />
              <Stat label="Best lap" value={last.bestLap?.display ?? '—'} />
              {lastPb && last.bestLap && (
                <Stat
                  label="vs personal best"
                  value={last.bestLap.us === lastPb.lapTime.us ? 'New PB!' : formatDelta(last.bestLap.us - lastPb.lapTime.us)}
                  highlight={last.bestLap.us === lastPb.lapTime.us}
                />
              )}
              <Stat label="Laps" value={String(last.laps)} />
            </StatGrid>
          </Card>
        </>
      )}

      {!me?.driver && (
        <>
          <SectionTitle>Latest results</SectionTitle>
          {sessions.data &&
            (sessions.data.filter((s) => s.resultStatus === 'final').length === 0 ? (
              <Empty>No results yet.</Empty>
            ) : (
              sessions.data
                .filter((s) => s.resultStatus === 'final')
                .slice(0, 3)
                .map((s) => <SessionRow key={s.id} s={s} />)
            ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  checkin: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.accent, borderRadius: radius.lg, padding: 18 },
  checkinIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  checkinTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  checkinSub: { color: '#fff', opacity: 0.9, fontSize: 13 },
  checkinCode: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 2, marginTop: 2 },
  qaRow: { flexDirection: 'row', gap: 10 },
  qa: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 6, minHeight: 96 },
  qaIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  qaBadge: { color: colors.muted, fontSize: 12 },
});
