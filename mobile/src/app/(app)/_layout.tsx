import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { AppDataProvider } from '@/data/AppData';

// Everything in (app) requires a session and finished onboarding.
// The tabs live in (tabs); recipe detail, cook mode, budget and settings push over them.
export default function AppLayout() {
  const { status, user } = useAuth();
  if (status === 'restoring') return null;
  if (status !== 'signedIn') return <Redirect href="/login" />;
  if (!user?.onboardingCompleted) return <Redirect href="/onboarding" />;
  return (
    <AppDataProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="cook/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
      </Stack>
    </AppDataProvider>
  );
}
