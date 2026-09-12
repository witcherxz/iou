import CommonCrypto
import ExpoModulesCore

public class IouPrivacyCryptoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IouPrivacyCrypto")
    Constant("supported") { true }
    // AsyncFunction's default queue is separate from JavaScript and the main UI queue.
    AsyncFunction("derivePin") { (pin: String, saltHex: String, iterations: Int) -> String in
      guard pin.range(of: "^[0-9]{4,6}$", options: .regularExpression) != nil,
            saltHex.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil,
            iterations == 600_000 else {
        throw Exception(name: "InvalidPinParameters", description: "Invalid PIN derivation parameters")
      }
      var password = Array(pin.utf8)
      var salt: [UInt8] = stride(from: 0, to: 32, by: 2).map { offset in
        let start = saltHex.index(saltHex.startIndex, offsetBy: offset)
        return UInt8(saltHex[start..<saltHex.index(start, offsetBy: 2)], radix: 16)!
      }
      var output = [UInt8](repeating: 0, count: 32)
      defer {
        password.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
        salt.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
        output.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
      }
      let status = password.withUnsafeBytes { passwordBytes in
        salt.withUnsafeBytes { saltBytes in
          output.withUnsafeMutableBytes { outputBytes in
            CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
              passwordBytes.baseAddress!.assumingMemoryBound(to: Int8.self), passwordBytes.count,
              saltBytes.baseAddress!.assumingMemoryBound(to: UInt8.self), saltBytes.count,
              CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iterations),
              outputBytes.baseAddress!.assumingMemoryBound(to: UInt8.self), outputBytes.count)
          }
        }
      }
      guard status == kCCSuccess else {
        throw Exception(name: "PinDerivationFailed", description: "PIN derivation failed")
      }
      return output.map { String(format: "%02x", $0) }.joined()
    }
  }
}
