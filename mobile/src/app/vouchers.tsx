import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, Empty, ErrorBox, Loading, Muted, Screen, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatTicketCode } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors, mono } from '../lib/theme';

export default function Vouchers() {
  const rewards = useAsync(() => api.rewards(), []);
  const all = rewards.data?.redemptions ?? [];
  const ready = all.filter((v) => v.status === 'pending');
  const done = all.filter((v) => v.status !== 'pending');
  return (
    <Screen topInset={false} onRefresh={() => rewards.reload({ pull: true })} refreshing={rewards.refreshing}>
      {rewards.error && <ErrorBox message={rewards.error} onRetry={() => rewards.reload()} />}
      {rewards.loading && <Loading />}
      {rewards.data && ready.length === 0 && (
        <>
          <Empty>No vouchers to collect. Redeem points in the marketplace.</Empty>
          <Button title="Go to rewards" variant="secondary" onPress={() => router.replace('/rewards')} />
        </>
      )}
      {ready.map((v) => (
        <Card key={v.id} accent>
          <Text style={styles.title}>{v.name}</Text>
          <Text style={styles.code} accessibilityLabel={`Voucher code ${v.code.split('').join(' ')}`}>
            {formatTicketCode(v.code)}
          </Text>
          <Muted>Show this code at the counter to collect · {v.costTokens} points</Muted>
        </Card>
      ))}
      {done.length > 0 && <SectionTitle>Collected</SectionTitle>}
      {done.map((v) => (
        <Card key={v.id} style={{ opacity: 0.6 }}>
          <Text style={styles.title}>{v.name}</Text>
          <Muted>
            {v.status === 'fulfilled' ? 'Collected' : 'Cancelled'} · {formatDate(v.createdAt)}
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  code: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 4, ...mono },
});
