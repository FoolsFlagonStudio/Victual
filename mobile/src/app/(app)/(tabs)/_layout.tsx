import { Tabs } from 'expo-router';
import { TabBar } from '@/components/app/TabBar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="groceries" />
      <Tabs.Screen name="recipes" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
