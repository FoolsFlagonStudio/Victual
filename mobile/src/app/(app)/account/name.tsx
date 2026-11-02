import { useState } from 'react';
import { router } from 'expo-router';
import { ApiError } from '@/api/client';
import { usersApi } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { collectErrors, validate } from '@/auth/validation';
import { FormScreen } from '@/components/app/Form';
import { TextField } from '@/components/TextField';

export default function EditName() {
  const { user, authedRequest, updateUser } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const found = collectErrors({ firstName: validate.name(firstName, 'First name'), lastName: validate.name(lastName, 'Last name') });
    setErrors(found);
    if (Object.keys(found).length) return;
    setLoading(true);
    setError(null);
    try {
      updateUser(await usersApi.updateName(authedRequest, { firstName: firstName.trim(), lastName: lastName.trim() }));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen title="Name" submit="Save" onSubmit={submit} loading={loading} error={error}>
      <TextField label="First Name" value={firstName} onChangeText={setFirstName} error={errors.firstName} autoCapitalize="words" autoComplete="given-name" />
      <TextField label="Last Name" value={lastName} onChangeText={setLastName} error={errors.lastName} autoCapitalize="words" autoComplete="family-name" onSubmitEditing={submit} />
    </FormScreen>
  );
}
