import { StyleSheet, View } from 'react-native';
import { SteamingMark } from '@/brand/SteamingMark';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/themeContext';
import { StepTitle } from './components';

// "Building your plan!" - the steaming bowl plays while preferences save (and,
// once the backend has it, while the first meal plan generates).
export function BuildingPlan({ error, onRetry, onBack }: { error?: string | null; onRetry: () => void; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.group}>
        <SteamingMark height={80} />
        <View style={{ marginTop: 42 }}>
          <StepTitle>{error ? 'We hit a snag' : 'Building your\nplan!'}</StepTitle>
        </View>
        {error ? (
          <View style={{ alignItems: 'center', gap: 16, marginTop: 16 }}>
            <Text variant="bodySmall" color="subtle" style={{ textAlign: 'center', maxWidth: 280 }}>
              {error}
            </Text>
            <Button label="Try again" size="lg" onPress={onRetry} />
            <Text variant="fine" style={{ textDecorationLine: 'underline' }} onPress={onBack} accessibilityRole="link">
              Back to review
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Sits above center like the Loading frame (mark top at ~204pt of 874).
  group: { alignItems: 'center', marginBottom: 150 },
});
