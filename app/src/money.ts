/** All ledger arithmetic uses integer halalas; persisted values stay in riyals. */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

export function isMoneyAmount(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return false;
  const cents = toCents(value);
  return Number.isSafeInteger(cents) && cents > 0 &&
    Math.abs(value - fromCents(cents)) <= Number.EPSILON * Math.max(1, value) * 2;
}
