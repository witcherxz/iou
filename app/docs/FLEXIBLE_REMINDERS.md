# Flexible local reminders

The Arabic reminders screen now supports a saved local time, an additional reminder before each installment or debt is due, optional overdue follow-ups, a selected weekday for the general reminder, and one-off snoozes until tomorrow or 7 days later. All visible numbers use 0–9. Notification previews can hide names, amounts, and notes.

Existing installations retain their behavior: 20:00, Thursday for the weekly reminder, no early reminder, and no overdue repetition. Notification permission is requested only through the explicit enable action. The web preview stores preferences and explains that local notifications require the phone app.

## Scheduling behavior

- Choosing 1, 3, or 7 days before due adds a reminder; the due-day reminder remains.
- Overdue repetition uses calendar days anchored to the first unpaid installment, at the chosen local time. Amounts include only installments due by that follow-up. A coincident installment and overdue follow-up produce one alert.
- Snoozing suppresses earlier reminders for that debt and creates one reminder at the selected local time on the later day, including when overdue repetition is off. Existing cadence resumes afterwards. Clearing snooze returns to the normal schedule.
- Settled, voided, disabled, and undated debts produce no notifications.
- The device retains the nearest 60 debt reminders and the repeating weekly reminder. Opening or returning to the app rebuilds the schedule. This keeps the native pending-notification count bounded; a long-closed app eventually exhausts its one-off queue.
- Calendar arithmetic preserves the chosen wall-clock time across daylight-saving changes. While the app is open, a minute heartbeat detects a new calendar day, timezone offset or wall-clock adjustment greater than a minute and rebuilds the schedule. Returning to the app also rebuilds it; ordinary timer ticks do not repeatedly replace alarms. An existing snooze is an absolute timestamp.
- A dated reminder still in native pending storage after its due time can catch up for up to 24 hours, only if its debt, opt-in, scheduled instant and visible content still match the current plan. Catch-up presents it immediately and removes the stale dated request. Closed, disabled, older or no-longer-matching requests are discarded; missing native requests are never invented.
- Scheduling runs serially. A newer edit replaces an older batch; disabling reminders, revoking permission, or a scheduling failure removes stale scheduled alerts. Turning on private previews also dismisses already delivered notifications that could contain details.

The notifications are private reminders for the ledger owner. Nothing is sent to the other person. A denied Android permission offers the explicit enable action while another prompt is allowed. If it cannot be prompted again, or the reminder channel is disabled, the screen offers **إعدادات الجهاز** to open system settings. Returning from settings checks permission and rebuilds eligible reminders.

Delivery time remains subject to device notification permissions and power management. This app does not request Android special exact-alarm access; inexact alarms can arrive late. Android force-stop prevents reminders until the user opens the app again. Expo restores scheduled alarms after reboot/package replacement, and reopening IoU rebuilds its future queue. Catch-up applies only to still-pending requests within the limit above.

## Verification

[`scripts/reminder-checks.ts`](../scripts/reminder-checks.ts): 152 checks cover defaults and validation, 4 timezones, spring/fall DST, partial installments, ID collisions, snoozes, overdue cadence, stale/closed/voided debts, scheduling limits, and private content.

[`scripts/reminder-adapter-checks.ts`](../scripts/reminder-adapter-checks.ts): 48 checks exercise the native API boundary with a controlled notification stub, including blocked permission/channel combinations, delayed-request catch-up and rejection, private-preview cleanup, latest-edit-wins behavior, failures, weekly settings, and the web fallback.

Browser screenshots in `/tmp/iou-reminders` cover 320 px light, 390 px dark, and 1440 px light layouts, plus invalid-time feedback. Real notification delivery still needs Android/iOS device validation.

Implementation follows the [Expo SDK 57 notifications API](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), using dated triggers for debts and a weekly trigger for the general reminder. Android timing and stopped-app limits follow the [alarm documentation](https://developer.android.com/develop/background-work/services/alarms) and [stopped-state behavior](https://developer.android.com/about/versions/15/behavior-changes-all#stopped-state).
