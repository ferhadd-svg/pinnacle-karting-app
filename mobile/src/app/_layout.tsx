import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { colors } from '../lib/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, border: colors.border, primary: colors.accent, text: colors.text },
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Session', headerBackTitle: 'Back' }} />
          <Stack.Screen name="live/[id]" options={{ title: 'Live view', headerBackTitle: 'Back' }} />
          <Stack.Screen name="card" options={{ presentation: 'modal', title: 'Member card' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
          <Stack.Screen name="store/[venueId]" options={{ title: 'Store', headerBackTitle: 'Back' }} />
          <Stack.Screen name="venue/[id]" options={{ title: 'Leaderboard', headerBackTitle: 'Back' }} />
          <Stack.Screen name="ticket/[id]" options={{ title: 'Ticket', headerBackTitle: 'Back' }} />
          <Stack.Screen name="redeem" options={{ presentation: 'modal', title: 'Redeem a ticket' }} />
          <Stack.Screen name="results" options={{ title: 'Live & results', headerBackTitle: 'Back' }} />
          <Stack.Screen name="rewards" options={{ title: 'Rewards', headerBackTitle: 'Back' }} />
          <Stack.Screen name="vouchers" options={{ title: 'My Vouchers', headerBackTitle: 'Back' }} />
          <Stack.Screen name="my-racing" options={{ title: 'My Racing', headerBackTitle: 'Back' }} />
          <Stack.Screen name="my-indemnity" options={{ title: 'My Indemnity', headerBackTitle: 'Back' }} />
          <Stack.Screen name="receipts" options={{ title: 'My Purchase', headerBackTitle: 'Back' }} />
          <Stack.Screen name="waiver" options={{ title: 'Sign Indemnity', headerBackTitle: 'Back' }} />
          <Stack.Screen name="friends" options={{ title: 'Friends', headerBackTitle: 'Back' }} />
          <Stack.Screen name="password" options={{ title: 'Password', headerBackTitle: 'Back' }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
