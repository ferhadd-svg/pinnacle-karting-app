import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { SignInPrompt } from '../../components/SignInPrompt';
import { Button, Card, Empty, ErrorBox, Eyebrow, H1, Loading, Muted, Screen, SectionTitle } from '../../components/ui';
import { api, type Ticket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { colors, radius } from '../../lib/theme';

export default function Tickets() {
  const { me } = useAuth();
  const tickets = useAsync(() => (me?.driver ? api.myTickets() : Promise.resolve([])), [me?.driver?.id]);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me?.driver) {
    return (
      <Screen>
        <H1>Tickets</H1>
        <SignInPrompt title="Your tickets, in your pocket" body="Buy sessions in the app, add tickets from the kiosk with their code, and send spare tickets to friends." />
      </Screen>
    );
  }

  const active = (tickets.data ?? []).filter((t) => t.status === 'active');
  const past = (tickets.data ?? []).filter((t) => t.status !== 'active');

  const redeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await api.redeemTicket(code);
      setMsg({ ok: true, text: `Added: ${t.productName}` });
      setCode('');
      await tickets.reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={() => tickets.reload({ pull: true })} refreshing={tickets.refreshing}>
      <H1>Tickets</H1>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button title="Buy tickets" onPress={() => router.push('/shop')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Receipts" variant="secondary" onPress={() => router.push('/receipts')} />
        </View>
      </View>

      <Card>
        <Text style={styles.cardTitle}>Bought at the kiosk or counter?</Text>
        <Muted>Enter the code on your receipt to add the ticket to your wallet.</Muted>
        <View style={styles.redeemRow}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="e.g. 7KQ4 MZ2P"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Ticket code"
            style={styles.input}
            onSubmitEditing={() => code.trim().length >= 4 && void redeem()}
          />
          <View style={{ width: 92 }}>
            <Button title="Add" variant="secondary" onPress={redeem} disabled={code.trim().length < 4} loading={busy} />
          </View>
        </View>
        {msg && <Text style={{ color: msg.ok ? colors.you : colors.danger }}>{msg.text}</Text>}
      </Card>

      <SectionTitle>Ready to use ({active.length})</SectionTitle>
      {tickets.error && <ErrorBox message={tickets.error} onRetry={() => tickets.reload()} />}
      {tickets.loading && <Loading />}
      {tickets.data && active.length === 0 && <Empty>No tickets yet. Buy one above, or add a kiosk ticket with its code.</Empty>}
      {active.map((t) => (
        <TicketCard key={t.id} t={t} />
      ))}

      {past.length > 0 && (
        <>
          <SectionTitle>Used</SectionTitle>
          {past.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
        </>
      )}
    </Screen>
  );
}

function TicketCard({ t }: { t: Ticket }) {
  const used = t.status !== 'active';
  return (
    <Card onPress={() => router.push(`/ticket/${t.id}`)} style={[styles.ticket, used && { opacity: 0.55 }]}>
      <View style={styles.stub}>
        <Icon name="flag" color={used ? colors.muted : colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Eyebrow color={used ? colors.muted : colors.accent}>{used ? `Used ${formatDate(t.usedAt)}` : t.venueName}</Eyebrow>
        <Text style={styles.cardTitle}>{t.productName}</Text>
        <Muted>{used ? t.venueName : 'Tap to show at check-in'}</Muted>
      </View>
      <Icon name="chevron" color={colors.muted} size={20} />
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  redeemRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 17,
    letterSpacing: 2,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stub: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
