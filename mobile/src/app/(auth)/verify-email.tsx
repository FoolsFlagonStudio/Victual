import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/AuthProvider';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Divider } from '@/components/auth/parts';
import { Button } from '@/components/Button';
import { CodeInput } from '@/components/CodeInput';
import { Text } from '@/components/Text';
import { Icon } from '@/theme/icons';
import { useTheme } from '@/theme/themeContext';

// Design: envelope, message, divider, RESEND EMAIL + CHANGE EMAIL.
// The backend verifies with a 6-digit code (not a link), so a code entry sits
// under the message and submits on its own once all 6 digits are in.
const RESEND_COOLDOWN_S = 30;

export default function VerifyEmail() {
  const { email = '', firstName, lastName } = useLocalSearchParams<{ email: string; firstName?: string; lastName?: string }>();
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(value: string) {
    setError(null);
    setNotice(null);
    setVerifying(true);
    try {
      await signIn(await authApi.verifyEmail({ email, code: value }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    setError(null);
    setResending(true);
    try {
      await authApi.resendVerification(email);
      setNotice('A new code is on its way.');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreen top={240} hero={<Icon.email size={63} strokeWidth={2.25} color={colors.primary} />}>
      <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 34 }}>
        We've sent a 6-digit code to {email || 'your email'}. Please check your inbox and enter the code below to
        activate your account.
      </Text>

      <View style={{ marginTop: 24 }}>
        <CodeInput value={code} onChange={setCode} onComplete={verify} error={error} autoFocus editable={!verifying} />
        {verifying ? (
          <Text variant="fine" color="muted" style={{ textAlign: 'center', marginTop: 8 }}>
            Verifying...
          </Text>
        ) : notice ? (
          <Text variant="fine" color="muted" style={{ textAlign: 'center', marginTop: 8 }}>
            {notice}
          </Text>
        ) : null}
      </View>

      <Divider spacing={20} />

      <View style={{ alignItems: 'center', gap: 15 }}>
        <Button
          label={cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
          onPress={resend}
          loading={resending}
          disabled={cooldown > 0}
        />
        <Button
          label="Change email"
          // Unverified accounts can't change email on the backend yet, so this
          // goes back to Sign Up with everything filled in to fix the address.
          onPress={() => router.replace({ pathname: '/sign-up', params: { email, firstName, lastName } })}
        />
      </View>
    </AuthScreen>
  );
}
