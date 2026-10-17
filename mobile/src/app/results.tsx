import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { LivePanel } from '../components/race/LivePanel';
import { MyResultsPanel } from '../components/race/MyResultsPanel';
import { Chips, Screen } from '../components/ui';

type Segment = 'live' | 'mine';

export default function Results() {
  const params = useLocalSearchParams<{ tab?: Segment }>();
  const [segment, setSegment] = useState<Segment>(params.tab ?? 'live');
  const [refreshKey, setRefreshKey] = useState(0);
  // Deep links such as /race?tab=boards switch segment even when the tab is already open.
  useEffect(() => {
    if (params.tab) setSegment(params.tab);
  }, [params.tab]);
  return (
    <Screen topInset={false} onRefresh={() => setRefreshKey((k) => k + 1)}>
      <Chips
        options={[
          { value: 'live' as const, label: 'Live & results' },
          { value: 'mine' as const, label: 'My results' },
        ]}
        value={segment}
        onChange={setSegment}
      />
      {segment === 'live' && <LivePanel refreshKey={refreshKey} />}
      {segment === 'mine' && <MyResultsPanel refreshKey={refreshKey} />}
    </Screen>
  );
}
