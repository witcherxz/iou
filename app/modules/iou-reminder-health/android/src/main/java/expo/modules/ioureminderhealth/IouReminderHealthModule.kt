package expo.modules.ioureminderhealth

import android.app.AlarmManager
import android.app.usage.UsageStatsManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Reports the system conditions that decide whether scheduled reminders fire on time. */
class IouReminderHealthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IouReminderHealth")

    AsyncFunction("status") {
      val context = appContext.reactContext ?: throw IllegalStateException("No context")
      val alarms = context.getSystemService(AlarmManager::class.java)
      val power = context.getSystemService(PowerManager::class.java)
      mapOf(
        // expo-notifications uses setExactAndAllowWhileIdle only when this is true.
        "exactAlarms" to (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()),
        "batteryUnrestricted" to power.isIgnoringBatteryOptimizations(context.packageName),
        // 10 active, 20 working set, 30 frequent, 40 rare, 45 restricted (API 28+).
        "standbyBucket" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
          context.getSystemService(UsageStatsManager::class.java).appStandbyBucket else 10
      )
    }

    /** Opens the system "allow background use" prompt, or the optimisation list as a fallback. */
    AsyncFunction("requestBatteryUnrestricted") {
      val activity = appContext.currentActivity ?: throw IllegalStateException("No activity")
      try {
        activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${activity.packageName}")))
      } catch (_: ActivityNotFoundException) {
        activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
    }
  }
}
