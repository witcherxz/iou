import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { BACKUP_FILENAME } from '../config/app';
import { clientIdForPlatform, GOOGLE_SCOPES } from '../config/google';
import { PersistedState } from '../types';

WebBrowser.maybeCompleteAuthSession();

export const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const REFRESH_KEY = 'iou.google.refresh_token';

/** In-memory access token; refreshed from the stored refresh token as needed. */
let accessToken: string | null = null;
let accessTokenExpiry = 0;

export const redirectUri = AuthSession.makeRedirectUri({ scheme: 'iou', path: 'oauthredirect' });

export class NotConfiguredError extends Error {
  constructor() {
    super('Google OAuth client ID is not configured');
    this.name = 'NotConfiguredError';
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super('No Google account connected');
    this.name = 'NotSignedInError';
  }
}

async function saveRefreshToken(token: string | undefined | null) {
  if (!token) return;
  try {
    await SecureStore.setItemAsync(REFRESH_KEY, token);
  } catch {
    /* keychain unavailable — the session still works until the app closes */
  }
}

async function readRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function hasConnectedAccount(): Promise<boolean> {
  return !!(await readRefreshToken());
}

/** Full interactive consent. Returns true once a refresh token is stored. */
export async function signIn(): Promise<boolean> {
  const clientId = clientIdForPlatform();
  if (!clientId) throw new NotConfiguredError();

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: GOOGLE_SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return false;

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );

  accessToken = token.accessToken;
  accessTokenExpiry = Date.now() + (token.expiresIn ?? 3600) * 1000;
  await saveRefreshToken(token.refreshToken);
  return true;
}

export async function signOut() {
  accessToken = null;
  accessTokenExpiry = 0;
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Valid access token, refreshing silently when possible. */
async function getAccessToken(): Promise<string> {
  const clientId = clientIdForPlatform();
  if (!clientId) throw new NotConfiguredError();
  if (accessToken && Date.now() < accessTokenExpiry - 60_000) return accessToken;

  const refreshToken = await readRefreshToken();
  if (!refreshToken) throw new NotSignedInError();

  const token = await AuthSession.refreshAsync({ clientId, refreshToken }, discovery);
  accessToken = token.accessToken;
  accessTokenExpiry = Date.now() + (token.expiresIn ?? 3600) * 1000;
  // Google only re-issues a refresh token occasionally; keep the newer one.
  await saveRefreshToken(token.refreshToken);
  return accessToken;
}

async function driveFetch(url: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function findBackupFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
  );
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

/** Upload the ledger to the Drive appDataFolder (private to this app). */
export async function uploadBackup(state: PersistedState): Promise<void> {
  const body = JSON.stringify({ ...state, backedUpAt: new Date().toISOString() });
  const existing = await findBackupFileId();

  if (existing) {
    await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
    );
    return;
  }

  const boundary = 'iou-' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: BACKUP_FILENAME, parents: ['appDataFolder'] });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n` +
    `--${boundary}--`;

  await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
}

/** Returns the stored ledger, or null when no backup exists yet. */
export async function downloadBackup(): Promise<PersistedState | null> {
  const id = await findBackupFileId();
  if (!id) return null;
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return (await res.json()) as PersistedState;
}
