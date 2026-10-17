import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { SignInPrompt } from '../../components/SignInPrompt';
import { Button, Chips, Empty, ErrorBox, Loading, Screen } from '../../components/ui';
import { api, type Ticket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/hooks';
import { colors, radius, weight } from '../../lib/theme';

type Filter = 'all' | 'available' | 'used';

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const h = d.getHours();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(((h + 11) % 12) + 1)}:${p(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
};

export default function MyTickets() {
  const { me } = useAuth();
  const tickets = useAsync(() => (me?.driver ? api.myTickets() : Promise.resolve([])), [me?.driver?.id]);
  const [filter, setFilter] = useState<Filter>('all');
  const [venueId, setVenueId] = useState('');

  if (!me?.driver) {
    return (
      <Screen>
        <Text style={styles.title}>My Tickets</Text>
        <SignInPrompt title="Your tickets, in your pocket" body="Buy sessions in the app, add kiosk tickets with their code, and send spare tickets to friends." />
      </Screen>
    );
  }

  const all = tickets.data ?? [];
  const venues = [...new Map(all.map((t) => [t.venueId, t.venueName])).entries()];
  const shown = all.filter(
    (t) => (filter === 'all' || (filter === 'available' ? t.status === 'active' : t.status !== 'active')) && (!venueId || t.venueId === venueId),
  );

  return (
    <Screen onRefresh={() => tickets.reload({ pull: true })} refreshing={tickets.refreshing}>
      <Text style={styles.title} accessibilityRole="header">
        My Tickets
      </Text>
      <View style={styles.segments} accessibilityRole="tablist">
        {(['all', 'available', 'used'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f }}
            style={[styles.segment, filter === f && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, filter === f && styles.segmentTextOn]}>{f === 'all' ? 'All' : f === 'available' ? 'Available' : 'Used'}</Text>
          </Pressable>
        ))}
      </View>
      {venues.length > 1 && <Chips options={[{ value: '', label: 'All venues' }, ...venues.map(([value, label]) => ({ value, label }))]} value={venueId} onChange={setVenueId} />}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button title="Buy tickets" onPress={() => router.push('/store')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Redeem code" variant="secondary" onPress={() => router.push('/redeem')} />
        </View>
      </View>

      {tickets.error && <ErrorBox message={tickets.error} onRetry={() => tickets.reload()} />}
      {tickets.loading && <Loading />}
      {tickets.data && shown.length === 0 && (
        <Empty>{filter === 'used' ? 'No used tickets yet.' : 'No tickets here yet. Buy one, or redeem a code from the kiosk.'}</Empty>
      )}
      <View>
        {shown.map((t, i) => (
          <TicketRow key={t.id} t={t} first={i === 0} />
        ))}
      </View>
    </Screen>
  );
}

function TicketRow({ t, first }: { t: Ticket; first: boolean }) {
  const used = t.status !== 'active';
  return (
    <Pressable
      onPress={() => router.push(`/ticket/${t.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${t.venueName} ${t.productName}. Sessions used ${t.sessionsUsed} of ${t.sessionsTotal}. ${used ? 'Used' : 'Available'}.`}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { opacity: 0.7 }]}
    >
      <Icon name="ticket" color={colors.text} size={26} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.product}>
          {t.venueName.toUpperCase()} {t.productName.toUpperCase()}
        </Text>
        <Text style={styles.date}>{stamp(t.issuedAt)}</Text>
        <Text style={styles.sessions}>
          SESSION USED: {t.sessionsUsed} / {t.sessionsTotal}
        </Text>
      </View>
      <Text style={[styles.status, !used && { color: colors.accent }]}>{used ? 'Used' : 'Available'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: weight.light, textAlign: 'center' },
  segments: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', gap: 2 },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#090b17', borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  segmentOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.text, fontSize: 17 },
  segmentTextOn: { color: colors.accentText, fontWeight: weight.regular },
  actions: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },
  divider: { borderTopWidth: 1, borderTopColor: '#3a4a6a' },
  product: { color: colors.text, fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
  date: { color: colors.text, fontSize: 12 },
  sessions: { color: colors.accent, fontSize: 13, fontWeight: weight.regular, letterSpacing: 0.3 },
  status: { color: colors.text, fontSize: 14, width: 72, textAlign: 'right' },
});
