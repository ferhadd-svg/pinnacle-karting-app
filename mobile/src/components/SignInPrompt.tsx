import { router } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../lib/theme';
import { Button, Card, Muted } from './ui';

export function SignInPrompt({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Muted>{body}</Muted>
      <Button title="Sign in or create account" onPress={() => router.push('/sign-in')} />
    </Card>
  );
}
