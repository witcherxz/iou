type ConfirmationHandler = (title: string, message: string, confirmLabel: string) => Promise<boolean>;
let handler: ConfirmationHandler | null = null;

export function registerConfirmationHandler(next: ConfirmationHandler): () => void {
  handler = next;
  return () => { if (handler === next) handler = null; };
}

/** A missing host means the private UI is unavailable; cancel the pending action. */
export function confirmAction(title: string, message: string, confirmLabel = 'تأكيد'): Promise<boolean> {
  if (handler) return handler(title, message, confirmLabel);
  return Promise.resolve(false);
}
