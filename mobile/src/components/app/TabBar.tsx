import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { icons } from '@/theme/icons';
import { useTheme } from '@/theme/themeContext';
import { tap } from './ui';

export const TABS = [
  { name: 'home', label: 'Home', Glyph: icons.tabBar.home },
  { name: 'plan', label: 'Plan', Glyph: icons.tabBar.plan },
  { name: 'groceries', label: 'Groceries', Glyph: icons.tabBar.groceries },
  { name: 'recipes', label: 'Recipes', Glyph: icons.tabBar.recipes },
  { name: 'profile', label: 'Profile', Glyph: icons.tabBar.profile },
] as const;

// expo-router's own tab bar props (state, emitter, navigateToTab...). Taken from <Tabs>
// so a router upgrade that changes them fails the typecheck instead of crashing on tap.
type Props = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Bottom tab bar from the designs: sage icons, the active one forest with its label underneath. */
export function TabBar({ state, emitter, navigateToTab }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const active = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!active && !e.defaultPrevented) {
                tap();
                navigateToTab(route.key);
              }
            }}
            style={styles.tab}
          >
            <tab.Glyph size={28} color={active ? colors.selected : colors.primary} strokeWidth={1.75} />
            <Text style={[styles.label, { color: colors.selected, opacity: active ? 1 : 0 }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1.5, paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 1 },
  label: { fontSize: 11, lineHeight: 14 },
});
