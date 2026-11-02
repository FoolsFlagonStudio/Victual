import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { Text } from './Text';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

type CodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  /** Called once all digits are entered. */
  onComplete?: (code: string) => void;
  length?: number;
  error?: string | null;
  autoFocus?: boolean;
  editable?: boolean;
};

/**
 * 6-digit code entry styled like the underlined fields. One hidden TextInput
 * drives the cells, so paste and iOS/Android one-time-code autofill both work.
 */
export function CodeInput({ value, onChange, onComplete, length = 6, error, autoFocus, editable = true }: CodeInputProps) {
  const { colors } = useTheme();
  const input = useRef<TextInputInstance>(null);

  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => input.current?.focus()} accessible={false} style={styles.cells}>
        {Array.from({ length }, (_, i) => {
          const active = i === Math.min(value.length, length - 1) && editable;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                { borderBottomColor: error ? colors.danger : active ? colors.primary : colors.divider },
                active && { borderBottomWidth: 2 },
              ]}
            >
              <Text style={{ fontFamily: fontFamily('ui', 500), fontSize: 22, lineHeight: 30 }}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={input}
          value={value}
          onChangeText={(text) => {
            const digits = text.replace(/\D/g, '').slice(0, length);
            onChange(digits);
            if (digits.length === length) onComplete?.(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={length}
          autoFocus={autoFocus}
          editable={editable}
          caretHidden
          accessibilityLabel={`${length}-digit code`}
          style={styles.hidden}
        />
      </Pressable>
      {error ? (
        <Text variant="fine" color="danger" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  cell: { width: 34, height: 44, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, borderBottomWidth: 1 },
  hidden: { ...StyleSheet.absoluteFill, opacity: 0.011, color: 'transparent', backgroundColor: 'transparent' },
});
