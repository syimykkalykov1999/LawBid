import CryptoKit
import Foundation
import Security

/// Third pass M12 (owner 26.11: the text of an end-to-end encrypted message
/// in its push, like WhatsApp / Signal). Built into BOTH the app and this
/// extension.
///
/// The phone's push-preview key pair (X25519) is made once by the app and
/// kept in the keychain under the App Group (`group.<app bundle id>`), so
/// this extension reads it too; only the public half goes to the server.
/// A sender seals a short preview to it with HPKE (RFC 9180,
/// DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20-Poly1305, info
/// "lawbid push preview v1", no AAD; lib/features/chat/e2ee/push_preview_hpke.dart),
/// and the push carries it as `pp`. CryptoKit's HPKE (iOS 17+) opens it
/// here. Anything that fails — older iOS, the phone not unlocked since it
/// started (the key is readable only after the first unlock), a changed
/// blob — leaves the server's «Новое сообщение».
enum PushPreview {
  static let info = Data("lawbid push preview v1".utf8)
  private static let service = "com.lawbid.push-preview"
  private static let account = "x25519.v1"

  /// The longest preview shown (the sender cuts at 120 characters).
  static let maxChars = 200

  /// `group.<app bundle id>` from the app or from its extension.
  private static var group: String {
    let bundle = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
    let app =
      bundle.hasSuffix(".NotificationService")
      ? String(bundle.dropLast(".NotificationService".count)) : bundle
    return "group.\(app)"
  }

  /// The public key (raw, base64), made on the first call. Nil below
  /// iOS 17 (no CryptoKit HPKE to open previews with) or on a keychain
  /// error.
  static func publicKeyBase64() -> String? {
    guard #available(iOS 17.0, *) else { return nil }
    if let raw = load(),
      let key = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: raw)
    {
      return key.publicKey.rawRepresentation.base64EncodedString()
    }
    let key = Curve25519.KeyAgreement.PrivateKey()
    guard save(key.rawRepresentation) else { return nil }
    return key.publicKey.rawRepresentation.base64EncodedString()
  }

  /// The preview text inside [sealedBase64], or nil.
  static func open(_ sealedBase64: String) -> String? {
    guard #available(iOS 17.0, *) else { return nil }
    guard let sealed = Data(base64Encoded: sealedBase64), sealed.count > 48,
      let raw = load(),
      let key = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: raw)
    else { return nil }
    do {
      var recipient = try HPKE.Recipient(
        privateKey: key,
        ciphersuite: .Curve25519_SHA256_ChachaPoly,
        info: info,
        encapsulatedKey: sealed.prefix(32))
      let plain = try recipient.open(sealed.dropFirst(32), authenticating: Data())
      guard let text = String(data: plain, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty
      else { return nil }
      return String(text.prefix(maxChars))
    } catch {
      return nil
    }
  }

  private static func query() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecUseDataProtectionKeychain as String: true,
    ]
  }

  private static func load() -> Data? {
    var q = query()
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
      let data = out as? Data, data.count == 32
    else { return nil }
    return data
  }

  private static func save(_ raw: Data) -> Bool {
    SecItemDelete(query() as CFDictionary)
    var q = query()
    q[kSecValueData as String] = raw
    // Readable by the extension while the phone is locked, but only after
    // the first unlock since it started; never leaves this device.
    q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
  }
}
