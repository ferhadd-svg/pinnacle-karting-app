import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { SessionSummary } from '../lib/api';
import { formatDateTime, typeLabel } from '../lib/format';
import { colors, weight } from '../lib/theme';
import { Icon } from './Icon';
import { Card, Muted, StatusBadge } from './ui';

export function SessionRow({ s }: { s: SessionSummary }) {
  return (
    <Card onPress={() => router.push(`/session/${s.id}`)}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>
            {s.name}
          </Text>
          <Muted>
            {typeLabel[s.type]} · {s.track.name} · {formatDateTime(s.startedAt)}
          </Muted>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <StatusBadge status={s.resultStatus} />
            <Muted>{s.participantCount} drivers</Muted>
          </View>
        </View>
        <Icon name="chevron" color={colors.muted} size={20} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: weight.light },
});
