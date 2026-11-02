// Mirrors backend user/UserController and the signed-in parts of AuthController.
import type { AuthResponse, User } from './auth';

type Authed = <T>(path: string, opts?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => Promise<T>;

export const usersApi = {
  me: (authed: Authed) => authed<User>('/api/users/me'),
  updateName: (authed: Authed, body: { firstName?: string; lastName?: string }) =>
    authed<User>('/api/users/me', { method: 'PATCH', body }),
  /** IANA zone, e.g. "America/New_York". Plans use it for "today" and the weekly 11pm run. */
  updateTimezone: (authed: Authed, timezone: string) => authed<User>('/api/users/me', { method: 'PATCH', body: { timezone } }),
  deleteAccount: (authed: Authed, password: string) =>
    authed<void>('/api/users/me', { method: 'DELETE', body: { password } }),
  changePassword: (authed: Authed, body: { currentPassword: string; newPassword: string }) =>
    authed<AuthResponse>('/api/auth/password', { method: 'PATCH', body }),
  requestEmailChange: (authed: Authed, body: { newEmail: string; currentPassword: string }) =>
    authed<{ message: string }>('/api/auth/email-change', { method: 'POST', body }),
  confirmEmailChange: (authed: Authed, code: string) =>
    authed<User>('/api/auth/email-change/confirm', { method: 'POST', body: { code } }),
};
