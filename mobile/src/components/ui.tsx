import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ResultStatus } from '../lib/api';
import { statusLabel } from '../lib/format';
import { colors, mono, radius, space } from '../lib/theme';

/** Scrollable screen body with pull-to-refresh and safe-area padding. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  topInset = true,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.screen, { paddingTop: (topInset ? insets.top : 0) + space.lg }]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.h1} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Eyebrow({ children, color = colors.accent }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style, onPress, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: boolean }) {
  const body = [styles.card, accent && styles.cardAccent, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...body, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

export function Stat({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, highlight && { color: colors.purple }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

const badgeColor: Record<ResultStatus, string> = {
  live: colors.success,
  provisional: colors.amber,
  final: colors.text,
  not_started: colors.muted,
  cancelled: colors.muted,
};

export function StatusBadge({ status }: { status: ResultStatus }) {
  return (
    <View style={[styles.badge, { borderColor: badgeColor[status] }]} accessibilityLabel={`Result status: ${statusLabel[status]}`}>
      {status === 'live' && <View style={styles.liveDot} />}
      <Text style={[styles.badgeText, { color: badgeColor[status] }]}>{statusLabel[status]}</Text>
    </View>
  );
}

/** Explains the result status so provisional results are never mistaken for final ones. */
export function StatusNote({ status }: { status: ResultStatus }) {
  const text: Partial<Record<ResultStatus, string>> = {
    live: 'Live timing: updates as karts cross the line. Not official yet.',
    provisional: 'Provisional: the session has ended and results are being checked. They may still change.',
    final: 'Final: official results. These count towards personal bests, leaderboards and records.',
  };
  if (!text[status]) return null;
  return (
    <View style={[styles.note, { borderColor: status === 'final' ? colors.border : badgeColor[status] }]}>
      <Text style={styles.noteText}>{text[status]}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], (disabled || loading) && { opacity: 0.5 }, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentText : colors.text} />
      ) : (
        <Text style={[styles.buttonText, variant === 'primary' && { color: colors.accentText }, variant === 'danger' && { color: colors.danger }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.danger }}>
      <Text style={styles.cardTitle}>Something went wrong</Text>
      <Muted>{message}</Muted>
      {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Muted style={{ paddingVertical: space.sm }}>{children}</Muted>;
}

export const styles = StyleSheet.create({
  screen: { padding: space.lg, paddingBottom: 48, gap: space.md },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  cardAccent: { borderColor: colors.accent },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800', ...mono },
  statHint: { color: colors.muted, fontSize: 11 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  note: { borderWidth: 1, borderRadius: 12, padding: space.md, backgroundColor: colors.surface },
  noteText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  button: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, borderWidth: 1 },
  button_primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  button_secondary: { backgroundColor: colors.surface2, borderColor: colors.border },
  button_danger: { backgroundColor: colors.surface2, borderColor: colors.border },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chips: { gap: space.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: colors.accentText },
  center: { padding: space.xl, alignItems: 'center' },
});
