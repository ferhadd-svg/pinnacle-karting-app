import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MemberCard } from '../components/MemberCard';
import { Button, Muted } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

/** Full-screen member card for scanning at the check-in desk. */
export default function CardScreen() {
  const { me } = useAuth();
  if (!me?.driver) {
    return (
      <View style={styles.wrap}>
        <Muted>Sign in to get your member card.</Muted>
        <Button title="Sign in" onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <MemberCard name={me.driver.name} code={me.driver.memberCode} large />
      <Text style={styles.help}>Show this at the front desk before your session. Staff scan the code or type it in, and your lap times are saved to your account.</Text>
      <Muted style={{ textAlign: 'center' }}>Tip: turn your screen brightness up if the scanner struggles.</Muted>
      <Button title="Done" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 20, justifyContent: 'center' },
  help: { color: colors.text, fontSize: 16, lineHeight: 23, textAlign: 'center' },
});
