import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Muted } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors, radius, weight } from '../lib/theme';

export default function SignIn() {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else await register({ email: email.trim(), password, displayName: name.trim() });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const valid = email.includes('@') && password.length >= (mode === 'register' ? 8 : 1) && (mode === 'login' || name.trim().length > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>{mode === 'login' ? 'Welcome back' : 'Create your driver account'}</Text>
        <Muted>{mode === 'login' ? 'Sign in to see your laps and personal bests.' : 'Free. Your member card is ready as soon as you sign up.'}</Muted>
        {mode === 'register' && (
          <Field label="Driver name (shown on results)" value={name} onChangeText={setName} autoComplete="nickname" textContentType="nickname" />
        )}
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        <Field
          label={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          onSubmitEditing={() => valid && void submit()}
        />
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} disabled={!valid} loading={busy} />
        <Button
          title={mode === 'login' ? 'New here? Create an account' : 'I already have an account'}
          variant="secondary"
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 16 },
  h1: { color: colors.text, fontSize: 26, fontWeight: weight.thin },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, fontSize: 16, paddingHorizontal: 14, minHeight: 50 },
  error: { color: colors.danger, fontSize: 14 },
});
