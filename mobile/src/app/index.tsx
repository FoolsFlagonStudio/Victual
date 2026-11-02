import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { SplashBrand } from '@/components/SplashBrand';

// Splash: shown while the saved session is restored, then hands off to the app
// or to Log In. Holds for a beat so the brand moment doesn't just flicker.
const MIN_SPLASH_MS = 900;

export default function Splash() {
  const { status } = useAuth();
  const [held, setHeld] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHeld(false), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (held || status === 'restoring') return <SplashBrand />;
  return <Redirect href={status === 'signedIn' ? '/home' : '/login'} />;
}
