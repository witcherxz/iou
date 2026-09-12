# Flexible local reminders

The Arabic reminders screen now supports a saved local time, an additional reminder before each installment or debt is due, optional overdue follow-ups, a selected weekday for the general reminder, and one-off snoozes until tomorrow or 7 days later. All visible numbers use 0–9. Notification previews can hide names, amounts, and notes.

Existing installations retain their behavior: 20:00, Thursday for the weekly reminder, no early reminder, and no overdue repetition. Notification permission is requested only through the explicit enable action. The web preview stores preferences and explains that local notifications require the phone app.

## Scheduling behavior

- Choosing 1, 3, or 7 days before due adds a reminder; the due-day reminder remains.
- Overdue repetition uses calendar days anchored to the first unpaid installment, at the chosen local time. Amounts include only installments due by that follow-up. A coincident installment and overdue follow-up produce one alert.
- Snoozing suppresses earlier reminders for that debt and creates one reminder at the selected local time on the later day, including when overdue repetition is off. Existing cadence resumes afterwards. Clearing snooze returns to the normal schedule.
- Settled, voided, disabled, and undated debts produce no notifications.
- The device retains the nearest 60 debt reminders and the repeating weekly reminder. Opening or returning to the app rebuilds the schedule. This keeps the native pending-notification count bounded; a long-closed app eventually exhausts its one-off queue.
- Calendar arithmetic preserves the chosen wall-clock time across daylight-saving changes. Changing the device timezone takes effect when the app next rebuilds its schedule. An existing snooze is an absolute timestamp.
- Scheduling runs serially. A newer edit replaces an older batch; disabling reminders, revoking permission, or a scheduling failure removes stale scheduled alerts. Turning on private previews also dismisses already delivered notifications that could contain details.

The notifications are private reminders for the ledger owner. Nothing is sent to the other person. Delivery time remains subject to device notification permissions and power management.

## Verification

[`scripts/reminder-checks.ts`](../scripts/reminder-checks.ts): 130 checks cover defaults and validation, 4 timezones, spring/fall DST, partial installments, ID collisions, snoozes, overdue cadence, stale/closed/voided debts, scheduling limits, and private content.

[`scripts/reminder-adapter-checks.ts`](../scripts/reminder-adapter-checks.ts): 25 checks exercise the native API boundary with a controlled notification stub, including permission revocation, private-preview cleanup, latest-edit-wins behavior, failures, weekly settings, and the web fallback.

Browser screenshots in `/tmp/iou-reminders` cover 320 px light, 390 px dark, and 1440 px light layouts, plus invalid-time feedback. Real notification delivery still needs Android/iOS device validation.

Implementation follows the [Expo SDK 57 notifications API](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), using dated triggers for debts and a weekly trigger for the general reminder.
