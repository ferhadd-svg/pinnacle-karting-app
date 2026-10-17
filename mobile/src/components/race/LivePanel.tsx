import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync, usePolling } from '../../lib/hooks';
import { SessionRow } from '../SessionRow';
import { Chips, Empty, ErrorBox, Loading, SectionTitle } from '../ui';

/** All sessions: live ones first, then recent results. */
export function LivePanel({ refreshKey }: { refreshKey: number }) {
  const venues = useAsync(() => api.venues(), []);
  const [trackId, setTrackId] = useState('');
  const sessions = useAsync(() => api.sessions({ trackId: trackId || undefined, limit: 50 }), [trackId, refreshKey]);
  usePolling(() => void sessions.reload(), 10_000, true);

  const visible = (sessions.data ?? []).filter((s) => s.status !== 'cancelled' && s.status !== 'scheduled');
  const live = visible.filter((s) => s.resultStatus === 'live');
  const rest = visible.filter((s) => s.resultStatus !== 'live');
  const tracks = (venues.data ?? []).flatMap((v) => v.tracks.map((t) => ({ value: t.id, label: `${v.name} · ${t.name}` })));

  return (
    <>
      {tracks.length > 1 && <Chips options={[{ value: '', label: 'All tracks' }, ...tracks]} value={trackId} onChange={setTrackId} />}
      {sessions.error && <ErrorBox message={sessions.error} onRetry={() => sessions.reload()} />}
      {sessions.loading && <Loading />}
      {live.length > 0 && (
        <>
          <SectionTitle>On track now</SectionTitle>
          {live.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </>
      )}
      {sessions.data && (
        <>
          <SectionTitle>Recent sessions</SectionTitle>
          {rest.length ? rest.map((s) => <SessionRow key={s.id} s={s} />) : <Empty>No sessions yet.</Empty>}
        </>
      )}
    </>
  );
}
