// Mirrors backend/src/main/java/com/forkast/backend/auth/AuthController.java
import { request } from './client';

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  verified: boolean;
  premium: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
};

export type AuthResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: User;
};

type MessageResponse = { message: string };

export const authApi = {
  signup: (body: { firstName: string; lastName: string; email: string; password: string }) =>
    request<MessageResponse>('/api/auth/signup', { method: 'POST', body }),

  verifyEmail: (body: { email: string; code: string }) =>
    request<AuthResponse>('/api/auth/verify-email', { method: 'POST', body }),

  resendVerification: (email: string) =>
    request<MessageResponse>('/api/auth/resend-verification', { method: 'POST', body: { email } }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body }),

  refresh: (refreshToken: string) =>
    request<AuthResponse>('/api/auth/refresh', { method: 'POST', body: { refreshToken } }),

  logout: (refreshToken: string) =>
    request<void>('/api/auth/logout', { method: 'POST', body: { refreshToken } }),

  forgotPassword: (email: string) =>
    request<MessageResponse>('/api/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    request<AuthResponse>('/api/auth/reset-password', { method: 'POST', body }),
};
