import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { BoardsPanel } from '../../components/race/BoardsPanel';
import { LivePanel } from '../../components/race/LivePanel';
import { MyResultsPanel } from '../../components/race/MyResultsPanel';
import { Chips, H1, Screen } from '../../components/ui';

type Segment = 'live' | 'mine' | 'boards';

export default function Race() {
  const params = useLocalSearchParams<{ tab?: Segment }>();
  const [segment, setSegment] = useState<Segment>(params.tab ?? 'live');
  const [refreshKey, setRefreshKey] = useState(0);
  // Deep links such as /race?tab=boards switch segment even when the tab is already open.
  useEffect(() => {
    if (params.tab) setSegment(params.tab);
  }, [params.tab]);
  return (
    <Screen onRefresh={() => setRefreshKey((k) => k + 1)}>
      <H1>Race</H1>
      <Chips
        options={[
          { value: 'live' as const, label: 'Live & results' },
          { value: 'mine' as const, label: 'My results' },
          { value: 'boards' as const, label: 'Leaderboards' },
        ]}
        value={segment}
        onChange={setSegment}
      />
      {segment === 'live' && <LivePanel refreshKey={refreshKey} />}
      {segment === 'mine' && <MyResultsPanel refreshKey={refreshKey} />}
      {segment === 'boards' && <BoardsPanel refreshKey={refreshKey} />}
    </Screen>
  );
}
