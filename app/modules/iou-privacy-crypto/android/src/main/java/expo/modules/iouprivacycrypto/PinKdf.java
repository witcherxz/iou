package expo.modules.iouprivacycrypto;

import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Uses the platform cryptography provider; retains the v1 PIN verifier byte for byte. */
public final class PinKdf {
  private PinKdf() {}

  public static String derive(String pin, String saltHex, int iterations) throws GeneralSecurityException {
    if (!pin.matches("[0-9]{4,6}") || !saltHex.matches("[0-9a-f]{32}") || iterations != 600_000) {
      throw new IllegalArgumentException("Invalid PIN derivation parameters");
    }
    char[] password = pin.toCharArray();
    byte[] salt = new byte[16];
    for (int i = 0; i < salt.length; i++) salt[i] = (byte) Integer.parseInt(saltHex.substring(i * 2, i * 2 + 2), 16);
    PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, 256);
    byte[] derived = null;
    try {
      derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
      char[] encoded = new char[derived.length * 2];
      char[] digits = "0123456789abcdef".toCharArray();
      for (int i = 0; i < derived.length; i++) {
        encoded[i * 2] = digits[(derived[i] & 0xff) >>> 4];
        encoded[i * 2 + 1] = digits[derived[i] & 0xf];
      }
      return new String(encoded);
    } finally {
      spec.clearPassword();
      Arrays.fill(password, '\0');
      Arrays.fill(salt, (byte) 0);
      if (derived != null) Arrays.fill(derived, (byte) 0);
    }
  }
}
