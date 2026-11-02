import { useState } from 'react';
import { ApiError } from '@/api/client';
import { usersApi } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { FormScreen } from '@/components/app/Form';
import { TextField } from '@/components/TextField';

// Required by the App Store: accounts made in the app must be deletable in the app.
export default function DeleteAccount() {
  const { authedRequest, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password) return setError('Enter your password to confirm.');
    setLoading(true);
    setError(null);
    try {
      await usersApi.deleteAccount(authedRequest, password);
      await signOut();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <FormScreen
      title="Delete account"
      intro="This permanently deletes your account, preferences, meal plans and favorites. It can't be undone."
      submit="Delete my account"
      onSubmit={submit}
      loading={loading}
      error={error}
      danger
    >
      <TextField label="Password" password value={password} onChangeText={setPassword} autoComplete="current-password" onSubmitEditing={submit} />
    </FormScreen>
  );
}
