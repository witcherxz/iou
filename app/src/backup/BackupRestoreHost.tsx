import { useEffect } from 'react';

/** Mount after ConfirmationDialog inside PrivacyGate, so previews require a fresh private host. */
export function BackupRestoreHost({ onMount }: { onMount: () => () => void }) {
  useEffect(() => onMount(), [onMount]);
  return null;
}
