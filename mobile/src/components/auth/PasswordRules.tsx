import { StyleSheet, View } from 'react-native';
import { PASSWORD_RULES } from '@/auth/validation';
import { Text } from '@/components/Text';
import { Icon } from '@/theme/icons';
import { useTheme } from '@/theme/themeContext';

/** Live checklist under a new-password field: each rule turns green once it's met. */
export function PasswordRules({ value }: { value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.list} accessibilityLabel={`Password needs: ${PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.label).join(', ') || 'all set'}`}>
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <View key={r.key} style={styles.rule} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {ok ? <Icon.check size={13} color={colors.selected} strokeWidth={2.5} /> : <View style={[styles.dot, { backgroundColor: colors.muted }]} />}
            <Text variant="fine" style={{ color: ok ? colors.selected : colors.muted }}>
              {r.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: -2, marginBottom: 4 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 4 },
});
