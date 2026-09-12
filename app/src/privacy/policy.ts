/** Kept separate from ledger state: credentials must never enter an export. */
export const PRIVACY_KEY = 'iou.privacy-lock.v1';
export const PIN_ITERATIONS = 600_000;
export const PIN_DIGITS = /^[0-9]{4,6}$/;

export interface LockRecord {
  version: 1;
  algorithm: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  verifier: string;
  biometric: boolean;
  failedAttempts: number;
  blockedUntil: number;
}

export function normalizePin(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660))).replace(/[^0-9]/g, '').slice(0, 6);
}

export function parseLockRecord(raw: string): LockRecord {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid privacy record');
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.algorithm !== 'pbkdf2-sha256' || v.iterations !== PIN_ITERATIONS ||
    typeof v.salt !== 'string' || !/^[0-9a-f]{32}$/.test(v.salt) ||
    typeof v.verifier !== 'string' || !/^[0-9a-f]{64}$/.test(v.verifier) ||
    typeof v.biometric !== 'boolean' || !Number.isSafeInteger(v.failedAttempts) ||
    (v.failedAttempts as number) < 0 || (v.failedAttempts as number) > 1_000_000 ||
    !Number.isSafeInteger(v.blockedUntil) || (v.blockedUntil as number) < 0) {
    throw new Error('Invalid privacy record');
  }
  return { version: 1, algorithm: 'pbkdf2-sha256', iterations: PIN_ITERATIONS,
    salt: v.salt, verifier: v.verifier, biometric: v.biometric,
    failedAttempts: v.failedAttempts as number, blockedUntil: v.blockedUntil as number };
}

/** Five guesses, then exponential cooldown, capped at fifteen minutes. */
export function failedAttempt(record: LockRecord, now: number): LockRecord {
  const failedAttempts = Math.min(1_000_000, record.failedAttempts + 1);
  const delay = failedAttempts < 5 ? 0 : Math.min(900_000, 30_000 * 2 ** Math.min(5, failedAttempts - 5));
  return { ...record, failedAttempts, blockedUntil: delay ? now + delay : 0 };
}

export function sameVerifier(left: string, right: string): boolean {
  if (left.length !== 64 || right.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
