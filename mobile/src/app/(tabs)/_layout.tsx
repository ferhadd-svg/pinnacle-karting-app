import { Tabs } from 'expo-router/js-tabs';
import { Icon, type IconName } from '../../components/Icon';
import { colors, weight } from '../../lib/theme';

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
        tabBarLabelStyle: { fontSize: 11, fontWeight: weight.regular },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="store" options={tab('Store', 'flag')} />
      <Tabs.Screen name="tickets" options={tab('My Tickets', 'ticket')} />
      <Tabs.Screen name="me" options={tab('Me', 'user')} />
    </Tabs>
  );
}
