import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, request } from '@/api/client';
import { authApi, type AuthResponse, type User } from '@/api/auth';
import { tokenStorage } from './tokenStorage';

type Status = 'restoring' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  user: User | null;
  /** Store a session from login / verify / reset responses. */
  signIn: (res: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  /** Patch the cached user, e.g. onboardingCompleted after preferences are saved. */
  updateUser: (patch: Partial<User>) => void;
  /** Authenticated request: adds the access token and retries once after a refresh on 401. */
  authedRequest: <T>(path: string, opts?: Omit<Parameters<typeof request>[1], 'accessToken'>) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('restoring');
  const [user, setUser] = useState<User | null>(null);
  const accessToken = useRef<string | null>(null);
  const refreshing = useRef<Promise<boolean> | null>(null);

  const signIn = useCallback(async (res: AuthResponse) => {
    accessToken.current = res.accessToken;
    await tokenStorage.set(res.refreshToken);
    setUser(res.user);
    setStatus('signedIn');
  }, []);

  const clearSession = useCallback(async () => {
    accessToken.current = null;
    await tokenStorage.clear();
    setUser(null);
    setStatus('signedOut');
  }, []);

  // Refresh tokens rotate, so concurrent 401s must share one refresh call.
  const refresh = useCallback((): Promise<boolean> => {
    refreshing.current ??= (async () => {
      try {
        const stored = await tokenStorage.get();
        if (!stored) return false;
        await signIn(await authApi.refresh(stored));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status !== 0) await clearSession();
        return false;
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [signIn, clearSession]);

  // Restore the session on launch.
  useEffect(() => {
    refresh().then((ok) => {
      if (!ok) setStatus('signedOut');
    });
  }, [refresh]);

  const signOut = useCallback(async () => {
    const stored = await tokenStorage.get();
    if (stored) authApi.logout(stored).catch(() => {}); // best effort
    await clearSession();
  }, [clearSession]);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const authedRequest = useCallback<AuthContextValue['authedRequest']>(
    async (path, opts) => {
      try {
        return await request(path, { ...opts, accessToken: accessToken.current });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401 || !(await refresh())) throw e;
        return request(path, { ...opts, accessToken: accessToken.current });
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ status, user, signIn, signOut, updateUser, authedRequest }),
    [status, user, signIn, signOut, updateUser, authedRequest],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
