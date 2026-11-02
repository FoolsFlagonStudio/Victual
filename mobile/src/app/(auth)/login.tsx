import { useRef, useState } from 'react';
import { Alert, View, type TextInputInstance } from 'react-native';
import { Link, router } from 'expo-router';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/AuthProvider';
import { collectErrors, validate } from '@/auth/validation';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Fields, FooterLink, FormError, SocialSignIn } from '@/components/auth/parts';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';

type Field = 'email' | 'password';

export default function LogIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    const found = collectErrors({ email: validate.email(email), password: validate.required(password, 'Password') });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await signIn(await authApi.login({ email: email.trim(), password }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        // Signed up but never verified: send a fresh code and pick up where they left off.
        authApi.resendVerification(email.trim()).catch(() => {});
        router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      } else {
        setFormError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen title="Welcome Back">
      <Fields>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          password
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Fields>

      <View style={{ marginTop: 25, alignItems: 'center' }}>
        <FormError message={formError} />
        <Button label="Login" onPress={submit} loading={submitting} />
        <Link href={{ pathname: '/forgot-password', params: { email: email.trim() } }} style={{ marginTop: 8 }}>
          <Text variant="fine">Forgot Password?</Text>
        </Link>
      </View>

      <SocialSignIn mode="signIn" onPress={() => Alert.alert('Coming soon')} />

      <FooterLink prompt="Not a user?" label="Sign up" href="/sign-up" />
    </AuthScreen>
  );
}
