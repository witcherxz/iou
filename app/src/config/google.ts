import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * OAuth client IDs, read from `expo.extra.google` in app.json.
 * Create them at https://console.cloud.google.com/apis/credentials with the
 * Drive API enabled — see README.md for the full walkthrough.
 */
interface GoogleConfig {
  androidClientId?: string;
  iosClientId?: string;
  webClientId?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { google?: GoogleConfig };

export const GOOGLE = extra.google ?? {};

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

const PLACEHOLDER = /YOUR_.*_CLIENT_ID/;

export function clientIdForPlatform(): string | undefined {
  const id =
    Platform.OS === 'android' ? GOOGLE.androidClientId
    : Platform.OS === 'ios' ? GOOGLE.iosClientId
    : GOOGLE.webClientId;
  if (!id || PLACEHOLDER.test(id)) return undefined;
  return id;
}

/** False until real client IDs are filled in; the UI degrades gracefully. */
export const isGoogleConfigured = () => !!clientIdForPlatform();
