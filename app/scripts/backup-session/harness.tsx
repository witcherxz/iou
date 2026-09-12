/** Real React hooks/store; controlled I/O and the password host unmount signal. */
import React, { useEffect, useState } from 'react';
// The app has no React DOM declaration dependency; keep the test-only entry narrow.
const { createRoot } = require('react-dom/client') as {
  createRoot(container: HTMLElement): { render(node: React.ReactNode): void };
};
import { useBackup } from '../../src/useBackup';
import { BackupRestoreHost } from '../../src/backup/BackupRestoreHost';
import { emptyState } from '../../src/initialState';
import { PersistedState } from '../../src/types';
import { serialize } from '../../src/backup/types';
import { registerConfirmationHandler } from '../../src/confirm';
import { bridge } from './bridge';
import { StoreProvider, useStore } from '../../src/store/store';
import { storageWrites } from './runtime-stub';
const timer = globalThis.setTimeout.bind(globalThis);
globalThis.setTimeout = ((callback: any, delay?: number, ...args: any[]) =>
  timer(callback, delay === 5000 ? 50 : delay, ...args)) as typeof setTimeout;
// A real registry teardown reproduces the app's missing-private-host contract.
function ConfirmationHost() {
  useEffect(() => {
    const unregister = registerConfirmationHandler(async () => {
      bridge.confirmations++;
      if (!bridge.confirmHold) return bridge.confirm;
      return new Promise<boolean>((resolve) => {
        bridge.answerConfirmation = resolve;
      });
    });
    bridge.hostMounted = true;
    return () => {
      bridge.hostMounted = false;
      unregister();
      bridge.answerConfirmation?.(false);
      bridge.answerConfirmation = null;
    };
  }, []);
  return null;
}
function PasswordHost({ cancel }: { cancel: () => void }) {
  useEffect(() => () => cancel(), [cancel]);
  return null;
}
const noOpMount = () => () => {}; // Explicit old-tag comparison has no readiness signal.
function Harness() {
  const [state, setState] = useState<PersistedState>(
    () => JSON.parse(localStorage.getItem('backup-qa') || 'null') || emptyState(),
  );
  useEffect(() => {
    localStorage.setItem('backup-qa', JSON.stringify(state));
  }, [state]);
  const [unlocked, setUnlocked] = useState(true);
  const api = useBackup({
    state,
    ready: true,
    onPatch: (patch) => {
      bridge.patches.push(patch);
      setState((current) => ({ ...current, ...patch }));
    },
    onRestored: async (value) => {
      bridge.restores.push(value);
      setState(value);
    },
    onToast: (value) => bridge.toasts.push(value),
  });
  (window as any).harness = { ...api, state, setState, setUnlocked, bridge, serialize, emptyState };
  return (
    <>
      {unlocked && (
        <>
          <ConfirmationHost />
          <PasswordHost cancel={api.cancelPassword} />
          <BackupRestoreHost onMount={api.mountRestoreHost ?? noOpMount} />
        </>
      )}
      <pre>{JSON.stringify(api.backup)}</pre>
    </>
  );
}
function StoreHarness() {
  const store = useStore();
  const api = useBackup({
    state: store.state,
    ready: store.ready && !store.storageError,
    suspendAutomatic: !!store.recoveryNotice,
    onPatch: store.set,
    onRestored: store.replaceAll,
    onToast: store.showToast,
  });
  (window as any).harness = {
    ...api,
    ...store,
    setState: store.set,
    bridge,
    storageWrites,
    serialize,
    emptyState,
  };
  return (
    <>
      <ConfirmationHost />
      <PasswordHost cancel={api.cancelPassword} />
      <BackupRestoreHost onMount={api.mountRestoreHost ?? noOpMount} />
      <pre>{JSON.stringify(api.backup)}</pre>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  location.search === '?store=1' ? (
    <StoreProvider>
      <StoreHarness />
    </StoreProvider>
  ) : (
    <Harness />
  ),
);
