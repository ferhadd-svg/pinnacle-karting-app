import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { SignInPrompt } from '../components/SignInPrompt';
import { Button, Card, Empty, ErrorBox, Eyebrow, Loading, Muted, Screen, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatTicketCode } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors, mono, weight } from '../lib/theme';

/** Confirm dialog that also works in the web preview (Alert buttons are native-only). */
function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Redeem', onPress: () => resolve(true) },
    ]),
  );
}

export default function RewardsScreen() {
  const { me } = useAuth();
  const rewards = useAsync(() => (me?.driver ? api.rewards() : Promise.resolve(null)), [me?.driver?.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!me?.driver) {
    return (
      <Screen topInset={false}>
        <SignInPrompt title="Earn points every time you race" body="Members collect points for racing, podiums and ticket purchases, then swap them for drinks, merch and free sessions." />
      </Screen>
    );
  }
  const r = rewards.data;

  const redeem = async (id: string, name: string, cost: number) => {
    if (!(await confirm(`Redeem ${name}?`, `${cost} points will be taken from your balance. Show the voucher code at the counter.`))) return;
    setBusy(id);
    setMsg(null);
    try {
      const v = await api.redeemReward(id);
      setMsg({ ok: true, text: `Voucher ${formatTicketCode(v.code)} is ready. Show it at the counter.` });
      await rewards.reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen topInset={false} onRefresh={() => rewards.reload({ pull: true })} refreshing={rewards.refreshing}>
      {rewards.error && <ErrorBox message={rewards.error} onRetry={() => rewards.reload()} />}
      {rewards.loading && <Loading />}
      {r && (
        <>
          <View style={styles.hero} accessible accessibilityLabel={`Points balance ${r.balance}`}>
            <Eyebrow>Your points</Eyebrow>
            <Text style={styles.balance}>{r.balance}</Text>
            <Text style={styles.unit}>Pinnacle points</Text>
          </View>
          <Card>
            <Text style={styles.title}>How to earn</Text>
            <Muted>• {r.rules.participation} points for every race once results are final</Muted>
            <Muted>• {r.rules.podium} bonus points for a podium finish</Muted>
            <Muted>• {r.rules.perRm10} point for every RM10 spent in the app</Muted>
          </Card>

          {msg && <Text style={{ color: msg.ok ? colors.success : colors.danger }}>{msg.text}</Text>}

          {r.redemptions.some((x) => x.status === 'pending') && (
            <>
              <SectionTitle>Your vouchers</SectionTitle>
              {r.redemptions
                .filter((x) => x.status === 'pending')
                .map((x) => (
                  <Card key={x.id} accent>
                    <Text style={styles.title}>{x.name}</Text>
                    <Text style={styles.voucher} accessibilityLabel={`Voucher code ${x.code.split('').join(' ')}`}>
                      {formatTicketCode(x.code)}
                    </Text>
                    <Muted>Show this code at the counter to collect.</Muted>
                  </Card>
                ))}
            </>
          )}

          <SectionTitle>Marketplace</SectionTitle>
          {r.items.length === 0 && <Empty>No rewards available right now.</Empty>}
          {r.items.map((it) => {
            const short = r.balance < it.costTokens;
            return (
              <Card key={it.id}>
                <View style={styles.itemRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.title}>{it.name}</Text>
                    {it.description ? <Muted>{it.description}</Muted> : null}
                    <Text style={styles.cost}>{it.costTokens} points</Text>
                  </View>
                  <View style={{ width: 120 }}>
                    <Button
                      title={short ? `${it.costTokens - r.balance} more` : 'Redeem'}
                      variant={short ? 'secondary' : 'primary'}
                      disabled={short}
                      loading={busy === it.id}
                      onPress={() => redeem(it.id, it.name, it.costTokens)}
                    />
                  </View>
                </View>
              </Card>
            );
          })}

          <SectionTitle>History</SectionTitle>
          {r.ledger.length === 0 && <Empty>No points yet. Race to start earning.</Empty>}
          {r.ledger.length > 0 && (
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {r.ledger.map((l, i) => (
                <View key={i} style={[styles.ledgerRow, i > 0 && styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerText} numberOfLines={1}>
                      {l.reason}
                    </Text>
                    <Muted style={{ fontSize: 12 }}>{formatDate(l.createdAt)}</Muted>
                  </View>
                  <Text style={[styles.delta, { color: l.delta > 0 ? colors.success : colors.text }]}>
                    {l.delta > 0 ? '+' : '−'}
                    {Math.abs(l.delta)}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 2 },
  balance: { color: colors.text, fontSize: 56, fontWeight: weight.thin, ...mono },
  unit: { color: colors.muted, fontSize: 14 },
  title: { color: colors.text, fontSize: 16, fontWeight: weight.light },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cost: { color: colors.amber, fontWeight: weight.regular, marginTop: 2 },
  voucher: { color: colors.text, fontSize: 30, fontWeight: weight.thin, letterSpacing: 4, ...mono },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  ledgerText: { color: colors.text, fontSize: 14 },
  delta: { fontSize: 16, fontWeight: weight.light, ...mono },
});
