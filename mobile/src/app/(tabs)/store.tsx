import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PeakMark } from '../../components/Brand';
import { Shop } from '../../components/Shop';
import { TrackMap } from '../../components/TrackMap';
import { ErrorBox, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, radius, weight } from '../../lib/theme';

const KIND_LABEL = { indoor: 'INDOOR', outdoor: 'OUTDOOR', hybrid: 'HYBRID', circuit: 'CIRCUIT' } as const;

/** Store: with one venue it is that venue's shop; with several, pick a venue first. */
export default function Store() {
  const venues = useAsync(() => api.venues(), []);
  if (venues.data?.length === 1) return <Shop venueId={venues.data[0].id} inTab />;
  return (
    <Screen onRefresh={() => venues.reload({ pull: true })} refreshing={venues.refreshing}>
      <Text style={styles.title} accessibilityRole="header">
        Select Track
      </Text>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>CHOOSE WHERE YOU RACE</Text>
      </View>
      {venues.error && <ErrorBox message={venues.error} onRetry={() => venues.reload()} />}
      {venues.loading && <Loading />}
      {venues.data?.map((v) => (
        <Pressable
          key={v.id}
          onPress={() => router.push(`/store/${v.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${v.name}, ${KIND_LABEL[v.kind].toLowerCase()} track. ${v.tagline}`}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.left}>
            <View style={[styles.brandBlock, { backgroundColor: v.accentColor }]}>
              <PeakMark size={46} color="#0b0d18" />
              <Text style={styles.kind}>{KIND_LABEL[v.kind]}</Text>
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{v.name.replace(/^Pinnacle (Karting )?/, '').toUpperCase()}</Text>
              <Text style={styles.tagline} numberOfLines={1}>
                {v.tagline}
              </Text>
            </View>
          </View>
          <View style={styles.art}>
            <TrackMap path={v.tracks[0]?.mapPath ?? null} color={v.accentColor} size={120} />
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: weight.light, textAlign: 'center' },
  banner: { borderRadius: 4, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accent },
  bannerText: { color: colors.accentText, fontSize: 20, fontWeight: weight.light, letterSpacing: 2 },
  card: { flexDirection: 'row', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.surface, minHeight: 150 },
  left: { flex: 1.1 },
  brandBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 2 },
  kind: { color: '#0b0d18', fontSize: 11, fontWeight: weight.regular, letterSpacing: 5 },
  nameBlock: { flex: 1, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  name: { color: colors.text, fontSize: 17, fontWeight: weight.light, letterSpacing: 0.5 },
  tagline: { color: colors.muted, fontSize: 12 },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#11152a' },
});
