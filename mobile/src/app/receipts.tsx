import { StyleSheet, Text, View } from 'react-native';
import { Card, Empty, ErrorBox, Loading, Muted, Screen } from '../components/ui';
import { api, formatRM } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors } from '../lib/theme';

export default function Receipts() {
  const orders = useAsync(() => api.myOrders(), []);
  return (
    <Screen topInset={false} onRefresh={() => orders.reload({ pull: true })} refreshing={orders.refreshing}>
      {orders.error && <ErrorBox message={orders.error} onRetry={() => orders.reload()} />}
      {orders.loading && <Loading />}
      {orders.data && orders.data.length === 0 && <Empty>No purchases yet.</Empty>}
      {orders.data?.map((o) => (
        <Card key={o.id}>
          <View style={styles.row}>
            <Text style={styles.title}>{o.venueName}</Text>
            <Text style={[styles.status, { color: o.status === 'paid' ? colors.success : colors.amber }]}>{o.status.toUpperCase()}</Text>
          </View>
          <Muted>
            {formatDateTime(o.paidAt ?? o.createdAt)} · Ref {o.id.slice(0, 8).toUpperCase()}
            {o.paymentProvider === 'demo' ? ' · demo payment' : ''}
          </Muted>
          {o.items.map((i, n) => (
            <View key={n} style={styles.row}>
              <Text style={styles.line}>
                {i.quantity} × {i.name}
              </Text>
              <Text style={styles.line}>{formatRM(i.unitPriceSen * i.quantity)}</Text>
            </View>
          ))}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.title}>Total</Text>
            <Text style={styles.title}>{formatRM(o.totalSen)}</Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '800' },
  line: { color: colors.text, fontSize: 14 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
});
