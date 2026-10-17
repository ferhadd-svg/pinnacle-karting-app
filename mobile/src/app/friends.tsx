import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Empty, ErrorBox, Loading, Muted, Screen, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatMemberCode } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors, radius, weight } from '../lib/theme';

export default function Friends() {
  const { me } = useAuth();
  const friends = useAsync(() => api.friends(), []);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.addFriend(code);
      setMsg({ ok: true, text: r.status === 'accepted' ? `You and ${r.friend.name} are now friends.` : `Request sent to ${r.friend.name}.` });
      setCode('');
      await friends.reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await friends.reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const list = friends.data ?? [];
  const incoming = list.filter((f) => f.direction === 'incoming');
  const accepted = list.filter((f) => f.direction === 'friends');
  const outgoing = list.filter((f) => f.direction === 'outgoing');

  return (
    <Screen topInset={false} onRefresh={() => friends.reload({ pull: true })} refreshing={friends.refreshing}>
      <Card>
        <Text style={styles.title}>Add a friend</Text>
        <Muted>
          Ask for their member code (on their member card).{me?.driver ? ` Yours is ${formatMemberCode(me.driver.memberCode)}.` : ''}
        </Muted>
        <View style={styles.addRow}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="ABC 234"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Friend's member code"
            style={styles.input}
          />
          <View style={{ width: 92 }}>
            <Button title="Add" onPress={add} disabled={code.trim().length < 6} loading={busy} />
          </View>
        </View>
        {msg && <Text style={{ color: msg.ok ? colors.success : colors.danger }}>{msg.text}</Text>}
      </Card>
      {friends.error && <ErrorBox message={friends.error} onRetry={() => friends.reload()} />}
      {friends.loading && <Loading />}

      {incoming.length > 0 && (
        <>
          <SectionTitle>Requests</SectionTitle>
          {incoming.map((f) => (
            <Card key={f.driverId}>
              <Text style={styles.title}>{f.name}</Text>
              <View style={styles.addRow}>
                <View style={{ flex: 1 }}>
                  <Button title="Accept" onPress={() => act(() => api.acceptFriend(f.driverId))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Decline" variant="secondary" onPress={() => act(() => api.removeFriend(f.driverId))} />
                </View>
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Friends ({accepted.length})</SectionTitle>
      {friends.data && accepted.length === 0 && <Empty>No friends yet. Compare lap times on the Friends leaderboard once you've added some.</Empty>}
      {accepted.map((f) => (
        <Card key={f.driverId}>
          <View style={styles.friendRow}>
            <Text style={[styles.title, { flex: 1 }]}>{f.name}</Text>
            <View style={{ width: 110 }}>
              <Button title="Remove" variant="danger" onPress={() => act(() => api.removeFriend(f.driverId))} />
            </View>
          </View>
        </Card>
      ))}
      {outgoing.length > 0 && <Muted>Waiting for: {outgoing.map((f) => f.name).join(', ')}</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: weight.light },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, fontSize: 17, letterSpacing: 2, paddingHorizontal: 14, minHeight: 48 },
});
