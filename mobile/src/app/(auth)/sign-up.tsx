import { useRef, useState } from 'react';
import { Alert, Linking, View, type TextInputInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/auth';
import { collectErrors, validate } from '@/auth/validation';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { PasswordRules } from '@/components/auth/PasswordRules';
import { Fields, FooterLink, FormError, InlineLink, SocialSignIn } from '@/components/auth/parts';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';

// TODO: point these at the website's real pages once they exist.
const TERMS_URL = 'https://victual.app/terms';
const PRIVACY_URL = 'https://victual.app/privacy';

type Field = 'firstName' | 'lastName' | 'email' | 'password' | 'confirm' | 'terms';

export default function SignUp() {
  // Prefilled when coming back from "Change Email" on Verify Email.
  const params = useLocalSearchParams<{ firstName?: string; lastName?: string; email?: string }>();
  const [firstName, setFirstName] = useState(params.firstName ?? '');
  const [lastName, setLastName] = useState(params.lastName ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lastNameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  async function submit() {
    const found = collectErrors({
      firstName: validate.name(firstName, 'First name'),
      lastName: validate.name(lastName, 'Last name'),
      email: validate.email(email),
      password: validate.password(password),
      confirm: password ? validate.match(confirm, password) : null,
      terms: agreed ? null : 'Please agree to the Terms of Service and Privacy Policy.',
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const body = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password };
    setSubmitting(true);
    try {
      await authApi.signup(body);
      router.replace({
        pathname: '/verify-email',
        params: { email: body.email, firstName: body.firstName, lastName: body.lastName },
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors((prev) => ({ ...prev, ...pickFieldErrors(e.fieldErrors) }));
        setFormError(e.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen title="Sign Up">
      <Fields>
        <TextField
          label="First Name"
          value={firstName}
          onChangeText={setFirstName}
          error={errors.firstName}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          onSubmitEditing={() => lastNameRef.current?.focus()}
        />
        <TextField
          ref={lastNameRef}
          label="Last Name"
          value={lastName}
          onChangeText={setLastName}
          error={errors.lastName}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          ref={emailRef}
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
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordRules value={password} />
        <TextField
          ref={confirmRef}
          label="Password Confirm"
          password
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
        />
      </Fields>

      <View style={{ marginTop: 12 }}>
        <Checkbox checked={agreed} onChange={setAgreed} error={!!errors.terms} accessibilityLabel="Agree to the Terms of Service and Privacy Policy">
          <Text variant="fine">
            By checking this box, you agree to be bound by our{' '}
            <InlineLink label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} /> and{' '}
            <InlineLink label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
          </Text>
        </Checkbox>
        {errors.terms ? (
          <Text variant="fine" color="danger" style={{ marginTop: 4 }}>
            {errors.terms}
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <FormError message={formError} />
        <Button label="Sign Up" onPress={submit} loading={submitting} />
      </View>

      <SocialSignIn mode="signUp" onPress={() => Alert.alert('Coming soon')} />

      <FooterLink prompt="Already a user?" label="Login" href="/login" />
    </AuthScreen>
  );
}

function pickFieldErrors(server: Record<string, string>): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const key of ['firstName', 'lastName', 'email', 'password'] as const) {
    if (server[key]) out[key] = server[key].charAt(0).toUpperCase() + server[key].slice(1) + '.';
  }
  return out;
}
