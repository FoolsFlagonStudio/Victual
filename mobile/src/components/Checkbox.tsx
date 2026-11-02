import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme/themeContext';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Read by screen readers. */
  accessibilityLabel: string;
  error?: boolean;
  children?: ReactNode;
};

export function Checkbox({ checked, onChange, accessibilityLabel, error, children }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        hitSlop={14}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.box,
          {
            borderColor: error ? colors.danger : checked ? colors.primary : colors.text,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked && <Check size={11} strokeWidth={3} color={colors.onPrimary} />}
      </Pressable>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  box: {
    width: 14,
    height: 14,
    marginTop: 1,
    borderWidth: 1,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
