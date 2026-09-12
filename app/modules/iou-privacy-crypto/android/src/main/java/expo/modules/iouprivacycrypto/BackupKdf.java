package expo.modules.iouprivacycrypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Portable backup PBKDF2, separate from the intentionally numeric-only PIN API. */
public final class BackupKdf {
  private BackupKdf() {}

  public static String derive(String passwordHex, String saltHex, int iterations) throws GeneralSecurityException {
    if (passwordHex == null || passwordHex.isEmpty() || passwordHex.length() > 8192 || passwordHex.length() % 2 != 0 ||
        !passwordHex.matches("[0-9a-f]+") || saltHex == null || !saltHex.matches("[0-9a-f]{32}") || iterations != 600_000) {
      throw new IllegalArgumentException("Invalid backup derivation parameters");
    }
    byte[] passwordBytes = decodeHex(passwordHex);
    byte[] salt = decodeHex(saltHex);
    byte[] derived = null;
    byte[] encodedPassword = null;
    char[] password = null;
    PBEKeySpec spec = null;
    try {
      // JS supplies TextEncoder output, so malformed UTF-16 has already become U+FFFD.
      String decoded = new String(passwordBytes, StandardCharsets.UTF_8);
      encodedPassword = decoded.getBytes(StandardCharsets.UTF_8);
      if (decoded.length() > 1024 || !Arrays.equals(passwordBytes, encodedPassword)) {
        throw new IllegalArgumentException("Invalid backup password encoding");
      }
      password = decoded.toCharArray();
      spec = new PBEKeySpec(password, salt, iterations, 256);
      derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
      char[] output = new char[derived.length * 2];
      char[] digits = "0123456789abcdef".toCharArray();
      for (int i = 0; i < derived.length; i++) {
        output[i * 2] = digits[(derived[i] & 0xff) >>> 4];
        output[i * 2 + 1] = digits[derived[i] & 0xf];
      }
      return new String(output);
    } finally {
      if (spec != null) spec.clearPassword();
      if (password != null) Arrays.fill(password, '\0');
      Arrays.fill(passwordBytes, (byte) 0);
      Arrays.fill(salt, (byte) 0);
      if (encodedPassword != null) Arrays.fill(encodedPassword, (byte) 0);
      if (derived != null) Arrays.fill(derived, (byte) 0);
    }
  }

  private static byte[] decodeHex(String value) {
    byte[] bytes = new byte[value.length() / 2];
    for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
    return bytes;
  }
}
