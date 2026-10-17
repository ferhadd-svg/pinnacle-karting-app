import { Tabs } from 'expo-router/js-tabs';
import { Icon, type IconName } from '../../components/Icon';
import { colors } from '../../lib/theme';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: string | import('react-native').ColorValue }) => <Icon name={icon} color={String(color)} />,
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="race" options={tab('Race', 'flag')} />
      <Tabs.Screen name="tickets" options={tab('Tickets', 'ticket')} />
      <Tabs.Screen name="rewards" options={tab('Rewards', 'gift')} />
      <Tabs.Screen name="me" options={tab('Me', 'user')} />
    </Tabs>
  );
}
