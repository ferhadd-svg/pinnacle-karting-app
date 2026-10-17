import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chips, ErrorBox, Loading, Muted, Screen } from '../components/ui';
import { api, formatRM } from '../lib/api';
import { useAuth } from '../lib/auth';
import { typeLabel } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors, mono, radius } from '../lib/theme';

/** Buy session tickets. Payment runs through the server's configured provider. */
export default function Shop() {
  const { me } = useAuth();
  const venues = useAsync(() => api.venues(), []);
  const [venueId, setVenueId] = useState('');
  useEffect(() => {
    if (!venueId && venues.data?.length) setVenueId(venues.data[0].id);
  }, [venues.data, venueId]);
  const catalogue = useAsync(() => (venueId ? api.products(venueId) : Promise.resolve(null)), [venueId]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [step, setStep] = useState<'pick' | 'pay' | 'done'>('pick');
  const [order, setOrder] = useState<{ id: string; totalSen: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const products = catalogue.data?.products ?? [];
  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const total = lines.reduce((s, p) => s + p.priceSen * qty[p.id], 0);
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)) }));

  if (!me?.driver) {
    return (
      <Screen topInset={false}>
        <Muted>Sign in to buy tickets.</Muted>
        <Button title="Sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.createOrder(venueId, lines.map((p) => ({ productId: p.id, quantity: qty[p.id] })));
      setOrder(r.order);
      setStep('pay');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pay = async () => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await api.payDemo(order.id);
      setStep('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <Screen topInset={false}>
        <Text style={styles.h1}>You're booked in 🏁</Text>
        <Muted>Your tickets are in your wallet. Show them with your member card at check-in.</Muted>
        <Button title="View my tickets" onPress={() => router.replace('/tickets')} />
      </Screen>
    );
  }

  if (step === 'pay' && order) {
    const demo = catalogue.data?.payments === 'demo';
    return (
      <Screen topInset={false}>
        <Text style={styles.h1}>Payment</Text>
        <Card>
          {lines.map((p) => (
            <View key={p.id} style={styles.line}>
              <Text style={styles.lineText}>
                {qty[p.id]} × {p.name}
              </Text>
              <Text style={styles.lineText}>{formatRM(p.priceSen * qty[p.id])}</Text>
            </View>
          ))}
          <View style={[styles.line, styles.totalLine]}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total}>{formatRM(order.totalSen)}</Text>
          </View>
        </Card>
        {demo ? (
          <Card style={{ borderColor: colors.amber }}>
            <Text style={styles.lineText}>Demo payment</Text>
            <Muted>This build isn't connected to a payment gateway yet. Confirming issues the tickets without charging anything.</Muted>
          </Card>
        ) : (
          <Muted>Online payment isn't available yet. Please buy at the counter.</Muted>
        )}
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {demo && <Button title={`Confirm demo payment · ${formatRM(order.totalSen)}`} onPress={pay} loading={busy} />}
      </Screen>
    );
  }

  return (
    <Screen topInset={false}>
      {(venues.data?.length ?? 0) > 1 && (
        <Chips options={(venues.data ?? []).map((v) => ({ value: v.id, label: v.name }))} value={venueId} onChange={(v) => { setVenueId(v); setQty({}); }} />
      )}
      {catalogue.error && <ErrorBox message={catalogue.error} onRetry={() => catalogue.reload()} />}
      {catalogue.loading && <Loading />}
      {products.map((p) => (
        <Card key={p.id}>
          <View style={styles.productRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Muted>{p.description}</Muted>
              <Muted style={{ fontSize: 12 }}>
                {typeLabel[p.sessionType]}
                {p.minAge ? ` · age ${p.minAge}+` : ''}
              </Muted>
              <Text style={styles.price}>{formatRM(p.priceSen)}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${p.name}`} onPress={() => set(p.id, -1)} style={styles.stepBtn}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.qty} accessibilityLabel={`${qty[p.id] ?? 0} selected`}>
                {qty[p.id] ?? 0}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${p.name}`} onPress={() => set(p.id, 1)} style={styles.stepBtn}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        </Card>
      ))}
      {catalogue.data?.payments === 'none' && <Muted>In-app payment isn't available yet; tickets can be bought at the counter and added with their code.</Muted>}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button title={total ? `Checkout · ${formatRM(total)}` : 'Choose tickets'} onPress={checkout} disabled={!total || catalogue.data?.payments === 'none'} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 26, fontWeight: '800' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  price: { color: colors.amber, fontSize: 16, fontWeight: '800', marginTop: 4, ...mono },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  stepText: { color: colors.text, fontSize: 20, fontWeight: '700' },
  qty: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 22, textAlign: 'center', ...mono },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  totalLine: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  total: { color: colors.text, fontSize: 18, fontWeight: '800' },
});
