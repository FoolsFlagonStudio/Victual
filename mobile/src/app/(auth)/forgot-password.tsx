import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/auth';
import { validate } from '@/auth/validation';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { FooterLink, FormError } from '@/components/auth/parts';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';

// Not in the Figma: step one of the reset flow, styled like Reset Password.
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const problem = validate.email(email);
    setError(problem);
    setFormError(null);
    if (problem) return;

    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      router.push({ pathname: '/reset-password', params: { email: email.trim() } });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Forgot Password"
      subtitle={
        <Text variant="fine" style={{ textAlign: 'center' }}>
          Enter the email you signed up with and we'll send you a 6-digit code to reset your password.
        </Text>
      }
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={error}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />

      <View style={{ marginTop: 25, alignItems: 'center' }}>
        <FormError message={formError} />
        <Button label="Send code" onPress={submit} loading={submitting} />
      </View>

      <FooterLink prompt="Remembered it?" label="Login" href="/login" />
    </AuthScreen>
  );
}
