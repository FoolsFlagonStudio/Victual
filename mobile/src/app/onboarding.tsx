import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { OnboardingFlow } from '@/onboarding/OnboardingFlow';

// New accounts land here after verifying their email (no preferences saved yet).
export default function Onboarding() {
  const { status, user } = useAuth();
  if (status === 'restoring') return null;
  if (status !== 'signedIn') return <Redirect href="/login" />;
  if (user?.onboardingCompleted) return <Redirect href="/home" />;
  return <OnboardingFlow />;
}
