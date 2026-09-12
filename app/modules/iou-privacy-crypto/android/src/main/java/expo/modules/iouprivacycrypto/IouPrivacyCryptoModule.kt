package expo.modules.iouprivacycrypto

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class IouPrivacyCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IouPrivacyCrypto")
    // PBKDF2WithHmacSHA256 is a platform algorithm from Android 8 (API 26).
    Constant("supported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.O }
    // Expo dispatches AsyncFunction on its worker queue, never the JS/UI thread.
    AsyncFunction("derivePin") { pin: String, saltHex: String, iterations: Int ->
      PinKdf.derive(pin, saltHex, iterations)
    }
  }
}
