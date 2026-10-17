import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { Button, Card, Muted, Screen } from '../components/ui';
import { api } from '../lib/api';
import { colors, radius } from '../lib/theme';

/** Add a kiosk/counter ticket to the wallet with the code on the receipt. */
export default function Redeem() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const redeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await api.redeemTicket(code);
      setMsg({ ok: true, text: `Added: ${t.productName}` });
      setCode('');
      setTimeout(() => router.back(), 900);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen topInset={false}>
      <Card>
        <Text style={styles.title}>Bought at the kiosk or counter?</Text>
        <Muted>Enter the 8-character code on your receipt. The ticket moves into your wallet.</Muted>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="e.g. 7KQ4 MZ2P"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Ticket code"
          style={styles.input}
          onSubmitEditing={() => code.trim().length >= 6 && void redeem()}
        />
        {msg && <Text style={{ color: msg.ok ? colors.accent : colors.danger }}>{msg.text}</Text>}
        <Button title="Add to my tickets" onPress={redeem} disabled={code.trim().length < 6} loading={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  input: { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, fontSize: 20, letterSpacing: 3, paddingHorizontal: 14, minHeight: 54 },
});
