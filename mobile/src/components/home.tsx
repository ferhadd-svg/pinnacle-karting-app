import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { HomeFeed } from '../lib/api';
import { colors, mono, radius } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { TrackMap } from './TrackMap';
import { Trophy, medalColor } from './Trophy';

export function QuickActions({ items }: { items: { icon: IconName; label: string; onPress: () => void; dim?: boolean }[] }) {
  return (
    <View style={styles.qaPanel}>
      {items.map((a) => (
        <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [styles.qa, pressed && { opacity: 0.6 }]}>
          <Icon name={a.icon} color={a.dim ? colors.muted : colors.accentSoft} size={30} />
          <Text style={[styles.qaLabel, a.dim && { color: colors.muted }]} numberOfLines={1}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Swipeable promotion banners with page dots. */
export function PromoCarousel({ promos }: { promos: HomeFeed['promotions'] }) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(width, 520) - 32;
  const [page, setPage] = useState(0);
  if (!promos.length) return null;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + 12)));
  return (
    <View>
      <ScrollView horizontal snapToInterval={cardW + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}>
        {promos.map((p, i) => (
          <View
            key={p.id}
            style={[styles.promo, { width: cardW, marginRight: i < promos.length - 1 ? 12 : 0, borderColor: p.color }]}
            accessible
            accessibilityLabel={`Promotion: ${p.badge ? `${p.badge}. ` : ''}${p.title}. ${p.subtitle}`}
          >
            <View style={[styles.promoStripe, { backgroundColor: p.color }]} />
            <View style={{ flex: 1, gap: 6, padding: 18 }}>
              {p.badge ? <Text style={[styles.promoBadge, { color: p.color }]}>{p.badge}</Text> : null}
              <Text style={styles.promoTitle}>{p.title}</Text>
              <Text style={styles.promoSub}>{p.subtitle}</Text>
              {p.venueName ? <Text style={styles.promoVenue}>{p.venueName}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
      {promos.length > 1 && (
        <View style={styles.dots}>
          {promos.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === page && { backgroundColor: colors.accentSoft, width: 18 }]} />
          ))}
        </View>
      )}
    </View>
  );
}

/** A venue's monthly best: coloured header, track outline, top 3. */
export function MonthlyBestCard({ item }: { item: HomeFeed['venues'][number] }) {
  const { venue, track, monthlyTop3 } = item;
  return (
    <Pressable
      onPress={() => router.push(`/venue/${venue.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name} monthly best. ${monthlyTop3.map((e) => `${e.position}, ${e.driver.name}, ${e.lapTime.display}`).join('. ') || 'No laps yet this month'}. Opens leaderboard.`}
      style={({ pressed }) => [styles.board, { borderColor: venue.color }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.boardHead, { backgroundColor: venue.color }]}>
        <Text style={styles.boardTitle}>{venue.name.toUpperCase()}</Text>
      </View>
      <View style={styles.boardBody}>
        <TrackMap path={track.mapPath} color={colors.accentSoft} size={104} />
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={styles.monthly}>MONTHLY BEST</Text>
          {monthlyTop3.length === 0 && <Text style={styles.empty}>No final laps yet this month</Text>}
          {monthlyTop3.map((e) => (
            <View key={e.driver.id} style={styles.boardRow}>
              <Text style={styles.pos}>{e.position}</Text>
              <Trophy color={medalColor(e.position)} size={20} />
              <Text style={styles.name} numberOfLines={1}>
                {e.driver.name}
              </Text>
              <Text style={styles.time}>{e.lapTime.display}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  qaPanel: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 14 },
  qa: { flex: 1, alignItems: 'center', gap: 8, minHeight: 64, justifyContent: 'center' },
  qaLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  promo: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', minHeight: 150 },
  promoStripe: { width: 10 },
  promoBadge: { fontSize: 26, fontWeight: '900', letterSpacing: 0.5 },
  promoTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  promoSub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  promoVenue: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  board: { borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden', backgroundColor: colors.bg },
  boardHead: { paddingHorizontal: 16, paddingVertical: 12 },
  boardTitle: { color: '#0b0d18', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  boardBody: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  monthly: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pos: { color: colors.text, width: 12, fontSize: 14 },
  name: { color: colors.text, flex: 1, fontSize: 14 },
  time: { color: colors.text, fontSize: 14, fontWeight: '600', ...mono },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center' },
});
