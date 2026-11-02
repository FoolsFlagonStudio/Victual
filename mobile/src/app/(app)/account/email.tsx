import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ApiError } from '@/api/client';
import { usersApi } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { collectErrors, validate } from '@/auth/validation';
import { FormScreen } from '@/components/app/Form';
import { CodeInput } from '@/components/CodeInput';
import { TextField } from '@/components/TextField';

// Two steps, matching the backend: request (new email + password) -> confirm the 6-digit code sent to the new address.
export default function ChangeEmail() {
  const { user, authedRequest, updateUser } = useAuth();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

  async function request() {
    const found = collectErrors({ email: validate.email(email), password: validate.required(password, 'Password') });
    setErrors(found);
    if (Object.keys(found).length) return;
    setLoading(true);
    setError(null);
    try {
      await usersApi.requestEmailChange(authedRequest, { newEmail: email.trim(), currentPassword: password });
      setStep('confirm');
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }

  async function confirm(value = code) {
    if (validate.code(value)) return setError('Enter the 6-digit code.');
    setLoading(true);
    setError(null);
    try {
      updateUser(await usersApi.confirmEmailChange(authedRequest, value));
      router.back();
    } catch (e) {
      fail(e);
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  return step === 'request' ? (
    <FormScreen title="Email" intro={`Currently ${user?.email}. We'll send a code to the new address to confirm it's yours.`} submit="Send code" onSubmit={request} loading={loading} error={error}>
      <TextField label="New Email" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <TextField label="Current Password" password value={password} onChangeText={setPassword} error={errors.password} autoComplete="current-password" onSubmitEditing={request} />
    </FormScreen>
  ) : (
    <FormScreen title="Email" intro={`Enter the 6-digit code we sent to ${email.trim()}.`} submit="Confirm" onSubmit={() => confirm()} loading={loading} error={error}>
      <View style={{ marginTop: 8 }}>
        <CodeInput value={code} onChange={setCode} onComplete={confirm} autoFocus editable={!loading} />
      </View>
    </FormScreen>
  );
}
