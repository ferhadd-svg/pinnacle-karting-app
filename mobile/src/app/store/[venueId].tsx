import { useLocalSearchParams } from 'expo-router';
import { Shop } from '../../components/Shop';

export default function VenueStore() {
  const { venueId = '' } = useLocalSearchParams<{ venueId: string }>();
  return <Shop venueId={venueId} />;
}
