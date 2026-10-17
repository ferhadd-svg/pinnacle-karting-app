import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { SignInPrompt } from '../../components/SignInPrompt';
import { Trophy } from '../../components/Trophy';
import { Button, ErrorBox, Loading, Muted, Screen } from '../../components/ui';
import { api, type Profile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { colors, mono, radius, weight } from '../../lib/theme';

function QrButton() {
  return (
    <Pressable onPress={() => router.push('/card')} accessibilityRole="button" accessibilityLabel="My QR code" style={styles.qrRow}>
      <Text style={styles.qrText}>My QR</Text>
      <View style={styles.qrCircle}>
        <Icon name="qr" color={colors.accentText} size={26} />
      </View>
    </Pressable>
  );
}

export default function MeScreen() {
  const { me, ready, signOut, refresh } = useAuth();
  const prof = useAsync(() => (me?.driver ? api.profile() : Promise.resolve(null)), [me?.driver?.id]);
  const waivers = useAsync(() => (me?.driver ? api.myWaivers() : Promise.resolve([])), [me?.driver?.id]);

  if (!ready) return <Loading />;
  if (!me) {
    return (
      <Screen>
        <SignInPrompt title="Your racing profile" body="Check in with your QR, collect points, track your mileage and keep every lap time." />
      </Screen>
    );
  }
  if (!me.driver) {
    return (
      <Screen>
        <Text style={styles.name}>{me.email}</Text>
        <Muted>Staff account ({me.role}). Use the operator console on the web to run sessions.</Muted>
        <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
      </Screen>
    );
  }

  const p = prof.data;
  const signed = (waivers.data ?? []).filter((w) => w.valid).length;
  const venuesWithWaiver = (waivers.data ?? []).length;
  const waiverOk = venuesWithWaiver > 0 && signed === venuesWithWaiver;
  const waiverSub = waiverOk ? 'Signed' : signed ? `${signed} of ${venuesWithWaiver} venues signed` : 'Review';

  return (
    <Screen onRefresh={() => Promise.all([prof.reload({ pull: true }), waivers.reload()])} refreshing={prof.refreshing}>
      <QrButton />
      {prof.error && <ErrorBox message={prof.error} onRetry={() => prof.reload()} />}
      {!p && prof.loading && <Loading />}
      {p && (
        <>
          <ProfileHeader p={p} />
          <Achievements p={p} />

          <View style={styles.grid}>
            <StatCard icon="star" value={p.points.toLocaleString()} label="Points" onPress={() => router.push('/rewards')} />
            <StatCard icon="ticket" value={String(p.ticketsReady)} label="Tickets ready" onPress={() => router.push('/tickets')} dim={p.ticketsReady === 0} />
            <TierCard p={p} />
            <StatCard
              icon="flag"
              value={p.currentKart ? `#${p.currentKart.number}` : '–'}
              label={p.currentKart ? `Current kart · ${p.currentKart.status === 'running' ? 'on track' : 'next session'}` : 'Current kart'}
              onPress={p.currentKart ? () => router.push(`/${p.currentKart!.status === 'running' ? 'live' : 'session'}/${p.currentKart!.sessionId}`) : undefined}
              tall
            />
          </View>

          <View style={styles.tiles}>
            <Tile icon="sign" title="Sign Indemnity" sub={waiverSub} warn={!waiverOk} onPress={() => router.push('/waiver')} />
            <Tile icon="speed" title="My Racing" sub={`${p.lapsDriven} laps`} onPress={() => router.push('/my-racing')} />
          </View>

          <Section title="History">
            <View style={styles.history}>
              <Round icon="cart" bg="#F25C1F" label="My Purchase" onPress={() => router.push('/receipts')} />
              <Round icon="star" bg="#d9480f" label="My Rewards" onPress={() => router.push('/rewards')} />
              <Round icon="doc" bg="#b83a10" label="My Indemnity" onPress={() => router.push('/my-indemnity')} />
            </View>
          </Section>
          <Section title="Vouchers">
            <Row label="My Vouchers" onPress={() => router.push('/vouchers')} />
          </Section>
          <Section title="Friends">
            <Row label="Friends & requests" onPress={() => router.push('/friends')} />
          </Section>
          <Section title="Security">
            <Row label="Password" onPress={() => router.push('/password')} />
          </Section>
          <Section title="Privacy">
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Show me on public leaderboards</Text>
                <Muted style={{ fontSize: 12 }}>When off, others see "Private driver". Friends still see you.</Muted>
              </View>
              <Switch
                value={me.driver.showOnLeaderboards}
                onValueChange={async (v) => {
                  await api.updateMyDriver({ showOnLeaderboards: v });
                  await refresh();
                }}
                trackColor={{ true: colors.accent, false: colors.border }}
                thumbColor={colors.text}
                accessibilityLabel="Show me on public leaderboards"
              />
            </View>
          </Section>
          <Muted style={{ fontSize: 12 }}>
            Member since {formatDate(p.driver.memberSince)} · {p.driver.email}
          </Muted>
          <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
        </>
      )}
    </Screen>
  );
}

function ProfileHeader({ p }: { p: Profile }) {
  return (
    <Pressable onPress={() => router.push('/my-racing')} accessibilityRole="button" accessibilityLabel={`${p.driver.name}, ${p.tier.name} member. Opens my racing.`} style={styles.header}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{p.driver.name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={styles.name} numberOfLines={1}>
          {p.driver.name.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <View style={styles.pill}>
            <Icon name="speed" color={colors.accentSoft} size={16} />
            <Text style={styles.pillText}>{p.tier.name}</Text>
          </View>
          <View style={styles.pill}>
            <Icon name="user" color={colors.accent} size={16} />
            <Text style={styles.pillText}>Member</Text>
          </View>
        </View>
      </View>
      <Icon name="chevron" color={colors.text} size={22} />
    </Pressable>
  );
}

/** "Daily top 3" trophy per venue: lit once you've finished a day in the top 3 there. */
function Achievements({ p }: { p: Profile }) {
  return (
    <View style={styles.achievements}>
      {p.achievements.map((a) => (
        <View
          key={a.venueId}
          style={styles.achievement}
          accessible
          accessibilityLabel={`${a.shortName}: ${a.days ? `daily top 3 on ${a.days} day${a.days > 1 ? 's' : ''}` : 'no daily top 3 yet'}`}
        >
          <View style={[styles.trophyRing, { borderColor: a.days ? a.color : colors.border, opacity: a.days ? 1 : 0.45 }]}>
            <Trophy color={a.days ? colors.gold : colors.muted} size={30} />
            <Text style={styles.daily}>DAILY TOP 3</Text>
          </View>
          {a.days > 1 && <Text style={styles.count}>×{a.days}</Text>}
          <Text style={styles.venueShort}>{a.shortName}</Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({ icon, value, label, onPress, dim, tall }: { icon: IconName; value: string; label: string; onPress?: () => void; dim?: boolean; tall?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}`} style={[styles.card, styles.cardAccent, dim && { opacity: 0.6 }, tall && { minHeight: 150 }]}>
      <Icon name={icon} color={colors.accentSoft} size={28} />
      <Text style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.cardLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function TierCard({ p }: { p: Profile }) {
  const t = p.tier;
  return (
    <View
      style={[styles.card, styles.cardAccentStrong, { minHeight: 150 }]}
      accessible
      accessibilityLabel={`${t.name} tier. Mileage ${p.mileageKm} kilometres.${t.next ? ` ${t.kmToNext} kilometres to ${t.next}.` : ''}`}
    >
      <Text style={styles.tierName}>{t.name}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(4, t.progress * 100)}%` }]} />
        <Text style={styles.progressText} numberOfLines={1}>
          {t.next ? `${t.kmToNext} KM to ${t.next}` : 'Top tier'}
        </Text>
      </View>
      <Text style={styles.cardValue} numberOfLines={1}>
        {p.mileageKm.toFixed(2)}
        <Text style={styles.unit}> KM</Text>
      </Text>
      <Text style={styles.cardLabel}>My Mileage</Text>
    </View>
  );
}

function Tile({ icon, title, sub, onPress, warn }: { icon: IconName; title: string; sub: string; onPress: () => void; warn?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${sub}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} color={colors.accentSoft} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={[styles.tileSub, warn && { color: colors.amber }]}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function Round({ icon, bg, label, onPress }: { icon: IconName; bg: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.round}>
      <View style={[styles.roundIcon, { backgroundColor: bg }]}>
        <Icon name={icon} color="#fff" size={28} />
      </View>
      <Text style={styles.roundLabel}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4, marginTop: 8 }}>
      <Text style={styles.section} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Icon name="chevron" color={colors.text} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  qrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  qrText: { color: colors.accent, fontSize: 24, fontWeight: weight.thin },
  qrCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.accentSoft, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accentSoft, fontSize: 34, fontWeight: weight.thin },
  name: { color: colors.text, fontSize: 22, fontWeight: weight.thin },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  pillText: { color: colors.text, fontSize: 14 },
  achievements: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  achievement: { alignItems: 'center', gap: 4, minWidth: 80 },
  trophyRing: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#24160f' },
  daily: { color: colors.gold, fontSize: 7, fontWeight: weight.regular, letterSpacing: 0.5 },
  count: { position: 'absolute', top: -2, right: 4, color: colors.accentText, backgroundColor: colors.accent, fontSize: 11, fontWeight: weight.regular, borderRadius: 8, paddingHorizontal: 5, overflow: 'hidden' },
  venueShort: { color: colors.text, fontSize: 13, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#1a1d2b', borderRadius: radius.lg, borderWidth: 2, padding: 16, gap: 6, minHeight: 130, justifyContent: 'flex-end' },
  cardAccent: { borderColor: colors.accentSoft },
  cardAccentStrong: { borderColor: colors.accent },
  cardValue: { color: colors.text, fontSize: 28, fontWeight: weight.thin, letterSpacing: 1, ...mono },
  cardLabel: { color: colors.text, fontSize: 15 },
  unit: { fontSize: 16, fontWeight: weight.light, letterSpacing: 0 },
  tierName: { color: colors.text, fontSize: 20, fontWeight: weight.light, letterSpacing: 2, textAlign: 'center' },
  progressTrack: { height: 22, borderRadius: 11, backgroundColor: '#f2f4fb', overflow: 'hidden', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accentSoft },
  progressText: { color: '#10142a', fontSize: 11, fontWeight: weight.regular, textAlign: 'center' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#2a1710', borderRadius: radius.md, padding: 16, minHeight: 72 },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: weight.light },
  tileSub: { color: colors.muted, fontSize: 13 },
  section: { color: colors.text, fontSize: 20, fontWeight: weight.light, marginBottom: 8 },
  history: { flexDirection: 'row', justifyContent: 'space-around' },
  round: { alignItems: 'center', gap: 8, minWidth: 96 },
  roundIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  roundLabel: { color: colors.text, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 48 },
  rowLabel: { color: colors.text, fontSize: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
