import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chips, ErrorBox, Loading, Muted, Screen } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { colors, radius, weight } from '../lib/theme';

/** Read and sign the venue's indemnity waiver. Signing is a deliberate act: name + explicit agreement. */
export default function WaiverScreen() {
  const { me } = useAuth();
  const venues = useAsync(() => api.venues(), []);
  const status = useAsync(() => api.myWaivers(), []);
  const [chosen, setChosen] = useState('');
  // Default to the first venue still needing a signature.
  const venueId = chosen || status.data?.find((w) => !w.valid)?.venue.id || venues.data?.[0]?.id;
  const tpl = useAsync(() => (venueId ? api.waiver(venueId) : Promise.resolve(null)), [venueId]);
  const [name, setName] = useState('');
  const [guardian, setGuardian] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me?.driver && !name) setName(me.driver.name);
  }, [me, name]);

  const current = status.data?.find((s) => s.venue.id === venueId);
  if ((tpl.loading && !tpl.data) || (status.loading && !status.data)) return <Loading />;
  if (tpl.error) return <Screen topInset={false}><ErrorBox message={tpl.error} onRetry={() => tpl.reload()} /></Screen>;
  if (!tpl.data) return null;

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.signWaiver({ templateId: tpl.data!.id, signedName: name, guardianName: guardian || undefined });
      await status.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      {(venues.data?.length ?? 0) > 1 && (
        <Chips
          options={(venues.data ?? []).map((v) => {
            const st = status.data?.find((w) => w.venue.id === v.id);
            return { value: v.id, label: `${st?.valid ? '✓ ' : ''}${v.shortName}` };
          })}
          value={venueId ?? ''}
          onChange={(v) => {
            setChosen(v);
            setAgree(false);
            setError(null);
          }}
        />
      )}
      <Text style={styles.h1}>{tpl.data.title}</Text>
      <Muted>
        {venues.data?.find((v) => v.id === venueId)?.name} · version {tpl.data.version} · valid for {tpl.data.validDays} days
      </Muted>
      {current?.valid && (
        <Card style={{ borderColor: colors.success }}>
          <Text style={[styles.title, { color: colors.success }]}>✓ Signed</Text>
          <Muted>
            Signed {formatDate(current.signedAt)} · valid until {formatDate(current.expiresAt)}
          </Muted>
          <Button title="Done" variant="secondary" onPress={() => router.back()} />
        </Card>
      )}
      <Card>
        <Text style={styles.body}>{tpl.data.body}</Text>
      </Card>
      {!current?.valid && (
        <Card>
          <Text style={styles.title}>Sign</Text>
          <Text style={styles.label}>Full name</Text>
          <TextInput value={name} onChangeText={setName} accessibilityLabel="Full name" style={styles.input} placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Parent or guardian name (required for drivers under 18)</Text>
          <TextInput value={guardian} onChangeText={setGuardian} accessibilityLabel="Parent or guardian name" style={styles.input} placeholderTextColor={colors.muted} />
          <Pressable
            onPress={() => setAgree(!agree)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agree }}
            style={styles.agreeRow}
          >
            <View style={[styles.box, agree && styles.boxOn]}>{agree && <Text style={styles.tick}>✓</Text>}</View>
            <Text style={styles.agreeText}>I have read and agree to this waiver.</Text>
          </Pressable>
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          <Button title="Sign waiver" onPress={sign} disabled={!agree || name.trim().length < 2} loading={busy} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 24, fontWeight: weight.thin },
  title: { color: colors.text, fontSize: 16, fontWeight: weight.light },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, fontSize: 16, paddingHorizontal: 14, minHeight: 48 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, minHeight: 44 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: '#fff', fontWeight: weight.regular },
  agreeText: { color: colors.text, fontSize: 15, flex: 1 },
});
