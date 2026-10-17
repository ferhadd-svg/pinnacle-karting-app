import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Empty, ErrorBox, Loading, Muted, Screen } from '../components/ui';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors } from '../lib/theme';

/** Every waiver you've signed, newest first. Signed copies are never edited. */
export default function MyIndemnity() {
  const list = useAsync(() => api.waiverHistory(), []);
  return (
    <Screen topInset={false} onRefresh={() => list.reload({ pull: true })} refreshing={list.refreshing}>
      {list.error && <ErrorBox message={list.error} onRetry={() => list.reload()} />}
      {list.loading && <Loading />}
      {list.data && list.data.length === 0 && (
        <>
          <Empty>You haven't signed an indemnity yet.</Empty>
          <Button title="Sign now" onPress={() => router.replace('/waiver')} />
        </>
      )}
      {list.data?.map((s) => (
        <Card key={s.id} style={s.inDate ? undefined : { opacity: 0.6 }}>
          <View style={styles.row}>
            <Text style={styles.title}>{s.venueName}</Text>
            <Text style={[styles.status, { color: s.inDate ? colors.accent : colors.muted }]}>{s.inDate ? 'VALID' : 'EXPIRED'}</Text>
          </View>
          <Muted>
            {s.title} · version {s.version}
          </Muted>
          <Muted>
            Signed by {s.signedName}
            {s.guardianName ? ` (guardian: ${s.guardianName})` : ''} on {formatDate(s.signedAt)} · valid until {formatDate(s.expiresAt)}
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
});
