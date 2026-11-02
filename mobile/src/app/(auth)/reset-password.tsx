import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/AuthProvider';
import { collectErrors, validate } from '@/auth/validation';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { PasswordRules } from '@/components/auth/PasswordRules';
import { Fields, FormError, InlineLink } from '@/components/auth/parts';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';

type Field = 'code' | 'password' | 'confirm';

// Design: New Password, Confirm New Password, SUBMIT. The backend also needs the
// 6-digit code from the reset email, so that field comes first. A successful
// reset signs the user straight in.
export default function ResetPassword() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  async function submit() {
    const found = collectErrors({
      code: validate.code(code.trim()),
      password: validate.password(password),
      confirm: password ? validate.match(confirm, password) : null,
    });
    setErrors(found);
    setFormError(null);
    setNotice(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await signIn(await authApi.resetPassword({ email, code: code.trim(), newPassword: password }));
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setFormError(null);
    try {
      await authApi.forgotPassword(email);
      setNotice('A new code is on its way.');
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <AuthScreen
      title="Reset Password"
      subtitle={
        <Text variant="fine" style={{ textAlign: 'center' }}>
          Enter the 6-digit code we sent to {email || 'your email'}.
        </Text>
      }
    >
      <Fields>
        <TextField
          label="6-Digit Code"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          error={errors.code}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="New Password"
          password
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordRules value={password} />
        <TextField
          ref={confirmRef}
          label="Confirm New Password"
          password
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Fields>

      <View style={{ marginTop: 25, alignItems: 'center' }}>
        <FormError message={formError} />
        <Button label="Submit" onPress={submit} loading={submitting} />
      </View>

      <Text variant="fine" style={{ textAlign: 'center', marginTop: 20 }}>
        {notice ?? "Didn't get a code?"} <InlineLink label="Resend" onPress={resend} />
      </Text>
    </AuthScreen>
  );
}
