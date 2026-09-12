import { failedAttempt, LockRecord, parseLockRecord, PIN_DIGITS, PIN_ITERATIONS, sameVerifier } from './policy';

export interface PrivacyAdapter {
  available(): Promise<boolean>;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
  randomSalt(): Promise<string>;
  derive(pin: string, salt: string, iterations: number): Promise<string>;
  hasBiometrics(): Promise<boolean>;
  authenticate(): Promise<boolean>;
  cancelAuthentication?(): Promise<void>;
  now(): number;
}

export interface PrivacySnapshot {
  ready: boolean;
  available: boolean;
  enabled: boolean;
  unlocked: boolean;
  busy: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricPrompt: boolean;
  blockedUntil: number;
  fatalError: string | null;
}

export class PrivacyError extends Error {}
export class PrivacyAuthorizationError extends PrivacyError {}
export class PrivacyTimeoutError extends PrivacyError {}

/** All verification is serialized; failures are persisted before another guess. */
export class PrivacyController {
  private record: LockRecord | null = null;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private authorizedUntil = 0;
  private pendingFailure: LockRecord | null = null;
  private pendingMutation: Promise<void> | null = null;
  private foreground = false;
  private automaticBiometricAttempted = false;
  private snapshot: PrivacySnapshot = { ready: false, available: false, enabled: false,
    unlocked: false, busy: false, biometricAvailable: false, biometricEnabled: false,
    biometricPrompt: false, blockedUntil: 0, fatalError: null };

  constructor(private adapter: PrivacyAdapter, private timeoutMs = 30_000) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<PrivacySnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.snapshot.busy) throw new PrivacyError('انتظر انتهاء المحاولة الحالية.');
    this.publish({ busy: true });
    try { return await operation(); } finally { this.publish({ busy: false }); }
  }
  /** A late native result cannot resume the caller after this promise times out. */
  private async wait<T>(pending: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PrivacyTimeoutError('استغرقت العملية وقتاً طويلاً. أعد المحاولة.')), this.timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  private async mutate(operation: () => Promise<void>) {
    // A timed-out SecureStore write may still finish natively. Do not race a new
    // write or read against it; reconciliation must await that original write.
    if (this.pendingMutation) await this.wait(this.pendingMutation);
    const pending = operation();
    this.pendingMutation = pending;
    const settled = () => { if (this.pendingMutation === pending) this.pendingMutation = null; };
    void pending.then(settled, settled);
    try { await this.wait(pending); }
    catch (error) {
      if (error instanceof PrivacyTimeoutError) this.publish({ unlocked: false,
        fatalError: 'تعذر تأكيد حفظ إعدادات القفل. أعد المحاولة؛ وإذا استمر الخطأ، أغلق التطبيق وافتحه مجدداً. لم يتم حذف بياناتك.' });
      throw error;
    }
  }
  initialize = async () => this.run(async () => {
    const knownLockOrError = !!(this.record || this.pendingFailure || this.snapshot.enabled || this.snapshot.fatalError);
    this.publish({ fatalError: null, unlocked: false });
    try {
      if (this.pendingMutation) await this.wait(this.pendingMutation);
      if (!await this.wait(this.adapter.available())) {
        if (knownLockOrError) throw new Error('Previously protected privacy storage is unavailable');
        this.publish({ ready: true, available: false, unlocked: true });
        return;
      }
      if (this.pendingFailure) {
        await this.mutate(() => this.adapter.write(JSON.stringify(this.pendingFailure)));
        this.pendingFailure = null;
      }
      const raw = await this.wait(this.adapter.read());
      this.record = raw === null ? null : parseLockRecord(raw);
      const biometricAvailable = await this.wait(this.adapter.hasBiometrics()).catch(() => false);
      this.publish({ ready: true, available: true, enabled: !!this.record, unlocked: !this.record,
        biometricAvailable, biometricEnabled: !!this.record?.biometric, blockedUntil: this.record?.blockedUntil ?? 0 });
    } catch {
      this.publish({ ready: true, unlocked: false,
        fatalError: this.pendingMutation ?
          'لم يكتمل حفظ إعدادات القفل. أغلق التطبيق وافتحه مجدداً ثم أعد المحاولة. لم يتم حذف بياناتك.' :
          'تعذر قراءة إعدادات القفل. أعد المحاولة بعد فتح قفل جهازك. لم يتم حذف بياناتك.' });
    }
  });

  lock = () => {
    this.epoch++;
    this.authorizedUntil = 0;
    if (this.snapshot.enabled) this.publish({ unlocked: false });
  };

  setForeground = (foreground: boolean) => { this.foreground = foreground; };
  background = () => {
    this.foreground = false;
    this.automaticBiometricAttempted = false;
    this.lock();
    if (this.snapshot.biometricPrompt) void this.adapter.cancelAuthentication?.().catch(() => {});
  };
  preferPin = () => { this.automaticBiometricAttempted = true; };
  lockManually = () => { this.preferPin(); this.lock(); };

  /** Once per real app visit. Native-prompt blur/focus never re-arms this latch. */
  autoUnlockWithBiometrics = async (): Promise<boolean> => {
    const state = this.snapshot;
    if (!this.foreground || this.automaticBiometricAttempted || !state.ready || !state.available ||
      !state.enabled || state.unlocked || state.busy || state.fatalError || state.biometricPrompt ||
      !state.biometricEnabled || !state.biometricAvailable) return false;
    this.automaticBiometricAttempted = true;
    try { return await this.authenticateBiometric(); } catch { return false; }
  };

  private async save(record: LockRecord) {
    try { await this.mutate(() => this.adapter.write(JSON.stringify(record))); }
    catch (error) { if (error instanceof PrivacyTimeoutError) throw error; throw new PrivacyError('تعذر حفظ إعدادات القفل. أعد المحاولة.'); }
    this.record = record;
    this.publish({ enabled: true, biometricEnabled: record.biometric, blockedUntil: record.blockedUntil });
  }
  private requireAuthorization() {
    if (!this.record || !this.snapshot.unlocked || this.authorizedUntil <= this.adapter.now()) {
      throw new PrivacyAuthorizationError('أكد هويتك مرة أخرى لتغيير القفل.');
    }
  }
  private async makeRecord(pin: string, biometric: boolean): Promise<LockRecord> {
    if (!PIN_DIGITS.test(pin)) throw new PrivacyError('استخدم رمزاً من 4 إلى 6 أرقام.');
    const salt = await this.wait(this.adapter.randomSalt());
    return { version: 1, algorithm: 'pbkdf2-sha256', iterations: PIN_ITERATIONS, salt,
      verifier: await this.wait(this.adapter.derive(pin, salt, PIN_ITERATIONS)),
      biometric: biometric && this.snapshot.biometricAvailable, failedAttempts: 0, blockedUntil: 0 };
  }
  enable = async (pin: string, biometric: boolean) => this.run(async () => {
    if (!this.snapshot.ready || !this.snapshot.available || this.snapshot.fatalError || this.record) {
      throw new PrivacyError('إعداد القفل غير متاح الآن.');
    }
    const epoch = this.epoch;
    const record = await this.makeRecord(pin, biometric);
    if (epoch !== this.epoch) throw new PrivacyError('أعد إعداد القفل بعد العودة للتطبيق.');
    await this.save(record);
    this.publish({ unlocked: epoch === this.epoch });
  });

  authenticatePin = async (pin: string, purpose: 'unlock' | 'settings' = 'unlock'): Promise<boolean> => this.run(async () => {
    this.preferPin();
    if (!this.snapshot.ready || this.snapshot.fatalError) throw new PrivacyError('أعد محاولة قراءة إعدادات القفل أولاً.');
    const record = this.record;
    if (!record || !PIN_DIGITS.test(pin)) throw new PrivacyError('أدخل رمزك من 4 إلى 6 أرقام.');
    if (record.blockedUntil > this.adapter.now()) throw new PrivacyError('محاولات كثيرة. انتظر انتهاء المدة ثم حاول مجدداً.');
    const epoch = this.epoch;
    const verifier = await this.wait(this.adapter.derive(pin, record.salt, record.iterations));
    if (!sameVerifier(verifier, record.verifier)) {
      // Keep the in-memory limit even when a storage write fails. Never permit
      // another guess after a failed persistence operation until a retry loads.
      const next = failedAttempt(record, this.adapter.now());
      this.record = next;
      this.pendingFailure = next;
      this.publish({ blockedUntil: next.blockedUntil });
      try { await this.save(next); }
      catch (error) { this.publish({ unlocked: false, fatalError: 'تعذر حفظ محاولات القفل. أعد المحاولة بعد فتح قفل جهازك.' }); throw error; }
      this.pendingFailure = null;
      return false;
    }
    await this.save({ ...record, failedAttempts: 0, blockedUntil: 0 });
    if (epoch !== this.epoch) return false;
    if (purpose === 'settings' && !this.snapshot.unlocked) return false;
    if (purpose === 'settings') this.authorizedUntil = this.adapter.now() + 60_000;
    else this.publish({ unlocked: true });
    return true;
  });

  authenticateBiometric = async (purpose: 'unlock' | 'settings' = 'unlock'): Promise<boolean> => this.run(async () => {
    this.automaticBiometricAttempted = true;
    if (!this.snapshot.ready || this.snapshot.fatalError) return false;
    if (!this.record?.biometric || !this.snapshot.biometricAvailable) return false;
    const epoch = this.epoch;
    this.publish({ biometricPrompt: true });
    try {
      const ok = await this.wait(this.adapter.authenticate()).catch(error => {
        if (error instanceof PrivacyTimeoutError) void this.adapter.cancelAuthentication?.().catch(() => {});
        return false;
      });
      if (!ok || epoch !== this.epoch) return false;
      if (purpose === 'settings' && !this.snapshot.unlocked) return false;
      await this.save({ ...this.record, failedAttempts: 0, blockedUntil: 0 });
      if (epoch !== this.epoch) return false;
      if (purpose === 'settings') this.authorizedUntil = this.adapter.now() + 60_000;
      else this.publish({ unlocked: true });
      return true;
    } finally { this.publish({ biometricPrompt: false }); }
  });

  changePin = async (pin: string, biometric: boolean) => this.run(async () => {
    this.requireAuthorization();
    const epoch = this.epoch;
    const record = await this.makeRecord(pin, biometric);
    this.requireAuthorization();
    if (epoch !== this.epoch) throw new PrivacyAuthorizationError('أكد هويتك مرة أخرى لتغيير القفل.');
    await this.save(record);
    this.authorizedUntil = 0;
  });

  disable = async () => this.run(async () => {
    this.requireAuthorization();
    try { await this.mutate(() => this.adapter.remove()); }
    catch (error) { if (error instanceof PrivacyTimeoutError) throw error; throw new PrivacyError('تعذر إيقاف القفل. أعد المحاولة.'); }
    this.record = null;
    this.authorizedUntil = 0;
    this.publish({ enabled: false, biometricEnabled: false, unlocked: true, blockedUntil: 0 });
  });
}
