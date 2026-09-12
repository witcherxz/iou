/**
 * Seed the demo ledger from the design on first launch.
 * Set to false to start with an empty book.
 */
export const SEED_ON_FIRST_LAUNCH = true;

export const STORAGE_KEY = 'iou.state.v1';

/** File name used inside the Drive appDataFolder. */
export const BACKUP_FILENAME = 'iou-backup.json';

/**
 * The prototype's keypad renders Western digits while every amount elsewhere is
 * Arabic-Indic. Flip this to render the keys as ٠-٩ instead.
 */
export const KEYPAD_ARABIC_DIGITS = false;
