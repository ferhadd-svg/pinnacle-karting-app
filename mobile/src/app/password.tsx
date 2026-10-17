import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Screen } from '../components/ui';
import { api } from '../lib/api';
import { colors, radius } from '../lib/theme';

export default function Password() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.changePassword(current, next);
      setMsg({ ok: true, text: 'Password changed.' });
      setTimeout(() => router.back(), 900);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const field = (label: string, value: string, set: (v: string) => void, auto: 'current-password' | 'new-password') => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={set} secureTextEntry autoComplete={auto} accessibilityLabel={label} style={styles.input} />
    </View>
  );
  return (
    <Screen topInset={false}>
      <Card>
        {field('Current password', current, setCurrent, 'current-password')}
        {field('New password (8+ characters)', next, setNext, 'new-password')}
        {field('Confirm new password', confirm, setConfirm, 'new-password')}
        {mismatch && <Text style={{ color: colors.danger }}>Passwords don't match.</Text>}
        {msg && <Text style={{ color: msg.ok ? colors.accent : colors.danger }}>{msg.text}</Text>}
        <Button title="Change password" onPress={save} disabled={!current || next.length < 8 || next !== confirm} loading={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, fontSize: 16, paddingHorizontal: 14, minHeight: 50 },
});
