import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '../../components/Brand';
import { MonthlyBestCard, PromoCarousel, QuickActions } from '../../components/home';
import { SessionRow } from '../../components/SessionRow';
import { ErrorBox, Loading, Screen, SectionTitle } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync, usePolling } from '../../lib/hooks';
import { colors, radius } from '../../lib/theme';

export default function Home() {
  const { me } = useAuth();
  const feed = useAsync(() => api.home(), []);
  const sessions = useAsync(() => api.sessions({ limit: 20 }), []);
  const waivers = useAsync(() => (me?.driver ? api.myWaivers() : Promise.resolve([])), [me?.driver?.id]);
  usePolling(() => void sessions.reload(), 15_000, true);
  const live = (sessions.data ?? []).filter((s) => s.resultStatus === 'live');
  const needsWaiver = (waivers.data ?? []).some((w) => !w.valid);

  return (
    <Screen onRefresh={() => Promise.all([feed.reload({ pull: true }), sessions.reload(), waivers.reload()])} refreshing={feed.refreshing}>
      <Wordmark />
      <QuickActions
        items={[
          { icon: 'flag', label: 'Join Race', onPress: () => router.push('/store') },
          { icon: 'sign', label: 'Indemnity', onPress: () => router.push(me ? '/waiver' : '/sign-in') },
          { icon: 'gift', label: 'Rewards', onPress: () => router.push(me ? '/rewards' : '/sign-in'), dim: !me },
          { icon: 'live', label: 'Live', onPress: () => router.push('/results') },
        ]}
      />

      {me?.driver && needsWaiver && (
        <Pressable onPress={() => router.push('/waiver')} accessibilityRole="button" style={styles.warn}>
          <Text style={styles.warnTitle}>Sign your indemnity before you race</Text>
          <Text style={styles.warnSub}>Takes a minute, saves time at the desk.</Text>
        </Pressable>
      )}

      {feed.data && <PromoCarousel promos={feed.data.promotions} />}

      {live.length > 0 && (
        <>
          <SectionTitle>On track now</SectionTitle>
          {live.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </>
      )}

      {feed.error && <ErrorBox message={feed.error} onRetry={() => feed.reload()} />}
      {feed.loading && <Loading />}
      {feed.data?.venues.map((v) => (
        <MonthlyBestCard key={v.venue.id} item={v} />
      ))}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: { borderWidth: 1, borderColor: colors.amber, borderRadius: radius.md, padding: 14, backgroundColor: colors.surface, gap: 2 },
  warnTitle: { color: colors.amber, fontWeight: '800', fontSize: 15 },
  warnSub: { color: colors.muted, fontSize: 13 },
});
