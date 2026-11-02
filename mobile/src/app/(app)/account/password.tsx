import { useState } from 'react';
import { router } from 'expo-router';
import { ApiError } from '@/api/client';
import { usersApi } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { collectErrors, validate } from '@/auth/validation';
import { FormScreen } from '@/components/app/Form';
import { TextField } from '@/components/TextField';
import { PasswordRules } from '@/components/auth/PasswordRules';

export default function ChangePassword() {
  const { authedRequest, signIn } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const found = collectErrors({
      current: validate.required(current, 'Current password'),
      next: validate.password(next),
      confirm: next ? validate.match(confirm, next) : null,
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setLoading(true);
    setError(null);
    try {
      // The backend signs out other devices and returns a fresh session for this one.
      await signIn(await usersApi.changePassword(authedRequest, { currentPassword: current, newPassword: next }));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen title="Password" intro="Use 8 or more characters with upper and lowercase letters, a number and a symbol." submit="Change password" onSubmit={submit} loading={loading} error={error}>
      <TextField label="Current Password" password value={current} onChangeText={setCurrent} error={errors.current} autoComplete="current-password" textContentType="password" />
      <TextField label="New Password" password value={next} onChangeText={setNext} error={errors.next} autoComplete="new-password" textContentType="newPassword" />
      <PasswordRules value={next} />
      <TextField label="Confirm New Password" password value={confirm} onChangeText={setConfirm} error={errors.confirm} autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
    </FormScreen>
  );
}
