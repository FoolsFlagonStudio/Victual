import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { FormError } from '@/components/auth/parts';
import { useTheme } from '@/theme/themeContext';
import { BackHeader, Screen } from './ui';

/** Simple account form: back header, intro, fields, submit. */
export function FormScreen({
  title,
  intro,
  children,
  submit,
  onSubmit,
  loading,
  error,
  danger,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  submit: string;
  onSubmit: () => void;
  loading?: boolean;
  error?: string | null;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<BackHeader title={title} />} contentStyle={{ paddingHorizontal: 36, paddingTop: 16 }}>
        {intro ? (
          <Text variant="bodySmall" color="subtle" style={{ marginBottom: 12 }}>
            {intro}
          </Text>
        ) : null}
        <View>{children}</View>
        <View style={{ marginTop: 28, alignItems: 'center' }}>
          <FormError message={error} />
          <Button label={submit} size="lg" loading={loading} onPress={onSubmit} style={danger ? { backgroundColor: colors.danger } : undefined} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
