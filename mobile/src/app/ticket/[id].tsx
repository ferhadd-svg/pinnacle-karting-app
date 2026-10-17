import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Qr } from '../../components/MemberCard';
import { Button, Card, Loading, Muted, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatTicketCode, typeLabel } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { colors, radius } from '../../lib/theme';

/** A ticket pass: big QR/code for check-in, plus transfer to another member. */
export default function TicketScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const tickets = useAsync(() => api.myTickets(), [id]);
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = tickets.data?.find((x) => x.id === id);

  if (tickets.loading) return <Loading />;
  if (!t) {
    return (
      <Screen topInset={false}>
        <Muted>This ticket is no longer in your wallet.</Muted>
        <Button title="Back to tickets" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  const active = t.status === 'active';

  const transfer = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.transferTicket(t.id, to);
      setMsg({ ok: true, text: `Sent to ${r.to.name}.` });
      setTimeout(() => router.back(), 900);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: t.productName }} />
      <View style={[styles.pass, !active && { opacity: 0.5 }]}>
        <Text style={styles.venue}>{t.venueName.toUpperCase()}</Text>
        <Text style={styles.product}>{t.productName}</Text>
        <Muted>{typeLabel[t.sessionType]}</Muted>
        <View style={styles.qr} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Qr value={`PKTICKET:${t.code}`} size={220} />
        </View>
        <Text style={styles.code} accessibilityLabel={`Ticket code ${t.code.split('').join(' ')}`}>
          {formatTicketCode(t.code)}
        </Text>
        <Text style={[styles.status, { color: active ? colors.you : colors.muted }]}>{active ? 'VALID · show at check-in' : `USED ${formatDate(t.usedAt)}`}</Text>
      </View>

      {active && (
        <Card>
          <Text style={styles.title}>Send to a friend</Text>
          <Muted>Enter their member code (on their member card). The ticket moves to their wallet.</Muted>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="Member code, e.g. ABC 234"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Friend's member code"
            style={styles.input}
          />
          {msg && <Text style={{ color: msg.ok ? colors.you : colors.danger }}>{msg.text}</Text>}
          <Button title="Send ticket" variant="secondary" onPress={transfer} disabled={to.trim().length < 6} loading={busy} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pass: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.accent, padding: 24, alignItems: 'center', gap: 6 },
  venue: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  product: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  qr: { marginTop: 12, borderRadius: 10, overflow: 'hidden' },
  code: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 4, marginTop: 8, fontVariant: ['tabular-nums'] },
  status: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, fontSize: 17, letterSpacing: 2, paddingHorizontal: 14, minHeight: 48 },
});
