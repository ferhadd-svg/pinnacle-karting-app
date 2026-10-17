import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BoardsPanel } from '../../components/race/BoardsPanel';
import { TrackMap } from '../../components/TrackMap';
import { Button, Eyebrow, Loading, Muted, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, radius, weight } from '../../lib/theme';
import { router } from 'expo-router';

/** One venue: header, then its leaderboards (records, periods, classes, friends). */
export default function VenueScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const venues = useAsync(() => api.venues(), []);
  const v = venues.data?.find((x) => x.id === id);
  const [refreshKey, setRefreshKey] = useState(0);
  if (!v) return <Loading />;
  return (
    <Screen topInset={false} onRefresh={() => setRefreshKey((k) => k + 1)}>
      <Stack.Screen options={{ title: v.name }} />
      <View style={[styles.head, { borderColor: v.accentColor }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Eyebrow color={v.accentColor}>{v.kind.toUpperCase()}</Eyebrow>
          <Text style={styles.h1}>{v.name}</Text>
          <Muted>{v.tagline}</Muted>
        </View>
        <TrackMap path={v.tracks[0]?.mapPath ?? null} color={v.accentColor} size={96} />
      </View>
      <Button title="Buy a session here" onPress={() => router.push(`/store/${v.id}`)} />
      <BoardsPanel refreshKey={refreshKey} trackId={v.tracks[0]?.id} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  h1: { color: colors.text, fontSize: 22, fontWeight: weight.thin },
});
