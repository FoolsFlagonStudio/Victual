import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Refresh token lives in the device keychain/keystore. The access token is
// short-lived and only kept in memory. On web (dev previews only) SecureStore
// doesn't exist, so it falls back to localStorage.
const KEY = 'victual.refreshToken';

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(KEY, token);
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear(): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(KEY);
    await SecureStore.deleteItemAsync(KEY);
  },
};
