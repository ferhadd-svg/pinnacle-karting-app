import { MyResultsPanel } from '../components/race/MyResultsPanel';
import { KartStats, Progress } from '../components/stats';
import { Empty, ErrorBox, Screen, SectionTitle, Stat, StatGrid } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useState } from 'react';

/** Stats and history: progress chart, personal bests, best kart, every session with filters. */
export default function MyRacing() {
  const { me } = useAuth();
  const id = me?.driver?.id;
  const history = useAsync(() => (id ? api.driverSessions(id) : Promise.resolve([])), [id]);
  const pbs = useAsync(() => (id ? api.personalBests(id) : Promise.resolve([])), [id]);
  const [refreshKey, setRefreshKey] = useState(0);
  const all = history.data ?? [];
  const finals = all.filter((s) => s.session.resultStatus === 'final');
  return (
    <Screen
      topInset={false}
      onRefresh={() => {
        setRefreshKey((k) => k + 1);
        void history.reload({ pull: true });
        void pbs.reload();
      }}
      refreshing={history.refreshing}
    >
      <StatGrid>
        <Stat label="Sessions" value={String(all.length)} />
        <Stat label="Laps" value={String(all.reduce((n, s) => n + s.laps, 0))} />
        <Stat label="Wins" value={String(finals.filter((s) => s.position === 1).length)} />
        <Stat label="Podiums" value={String(finals.filter((s) => s.position !== null && s.position <= 3).length)} />
      </StatGrid>
      {history.error && <ErrorBox message={history.error} onRetry={() => history.reload()} />}
      <Progress sessions={all} />
      <SectionTitle>Personal bests</SectionTitle>
      {pbs.data && pbs.data.length === 0 && <Empty>Personal bests appear once a session you drove in is finalised.</Empty>}
      <StatGrid>
        {(pbs.data ?? []).map((pb) => (
          <Stat key={`${pb.track.id}-${pb.kartClass?.id}`} label={`${pb.track.name}${pb.kartClass ? ` · ${pb.kartClass.name}` : ''}`} value={pb.lapTime.display} hint={formatDate(pb.setAt)} />
        ))}
      </StatGrid>
      <KartStats sessions={all} />
      <SectionTitle>My races</SectionTitle>
      <MyResultsPanel refreshKey={refreshKey} />
    </Screen>
  );
}
