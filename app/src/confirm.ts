import { Alert, Platform } from 'react-native';

type ConfirmationHandler = (title: string, message: string, confirmLabel: string) => Promise<boolean>;
let handler: ConfirmationHandler | null = null;

export function registerConfirmationHandler(next: ConfirmationHandler): () => void {
  handler = next;
  return () => { if (handler === next) handler = null; };
}

/** Await the themed dialog, retaining a native fallback before the host mounts. */
export function confirmAction(title: string, message: string, confirmLabel = 'تأكيد'): Promise<boolean> {
  if (handler) return handler(title, message, confirmLabel);
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
