import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { PrivacyAdapter } from './controller';
import { derivePin } from './crypto';
import { PRIVACY_KEY } from './policy';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  // A changed fingerprint must not invalidate the user's PIN fallback.
  requireAuthentication: false,
};

export const privacyAdapter: PrivacyAdapter = {
  available: async () => Platform.OS === 'web' ? true : SecureStore.isAvailableAsync(),
  read: async () => Platform.OS === 'web' ? window.localStorage.getItem(PRIVACY_KEY) : SecureStore.getItemAsync(PRIVACY_KEY, options),
  write: async value => {
    if (Platform.OS === 'web') window.localStorage.setItem(PRIVACY_KEY, value);
    else await SecureStore.setItemAsync(PRIVACY_KEY, value, options);
  },
  remove: async () => {
    if (Platform.OS === 'web') window.localStorage.removeItem(PRIVACY_KEY);
    else await SecureStore.deleteItemAsync(PRIVACY_KEY, options);
  },
  randomSalt: async () => bytesToHex(await Crypto.getRandomBytesAsync(16)),
  derive: derivePin,
  hasBiometrics: async () => Platform.OS !== 'web' && await LocalAuthentication.hasHardwareAsync() &&
    await LocalAuthentication.isEnrolledAsync() &&
    await LocalAuthentication.getEnrolledLevelAsync() === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG,
  authenticate: async () => {
    if (Platform.OS === 'web') return false;
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'فتح دفتر الديون',
      cancelLabel: 'استخدام الرمز', fallbackLabel: '', disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong' });
    return result.success;
  },
  now: Date.now,
};
