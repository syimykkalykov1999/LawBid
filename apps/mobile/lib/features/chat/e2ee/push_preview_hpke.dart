import 'dart:typed_data';

import 'package:crypto/crypto.dart' as c;
import 'package:cryptography/cryptography.dart';

/// Third pass M12 (owner 26.11: the text of an end-to-end encrypted message
/// in its push, like WhatsApp / Signal; own code approved): HPKE, RFC 9180,
/// base mode, single shot, with the suite every platform has natively:
/// DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20-Poly1305
/// (kem 0x0020, kdf 0x0001, aead 0x0003) — Apple CryptoKit
/// `HPKE.Ciphersuite.Curve25519_SHA256_ChachaPoly` (iOS 17+) and Google
/// Tink `DHKEM_X25519_HKDF_SHA256_HKDF_SHA256_CHACHA20_POLY1305_RAW`
/// (Android) open what this seals. Written to the RFC's pseudocode
/// (§4 LabeledExtract/Expand, §4.1 DHKEM, §5.1 KeySchedule, §5.2 seal) on
/// top of the maintained primitives of `cryptography` (X25519,
/// ChaCha20-Poly1305) and `crypto` (HMAC-SHA256); the test checks the RFC's
/// own vectors (Appendix A.2.1).
///
/// The sealed bytes are `enc (32) || ciphertext || tag (16)`, the layout of
/// Tink's RAW hybrid encryption; `info` is the HPKE info (Tink's context
/// info) and the AAD is empty.
abstract final class PushPreviewHpke {
  /// What every preview is bound to (CryptoKit `info`, Tink context info).
  static final info = Uint8List.fromList('lawbid push preview v1'.codeUnits);

  static final _x25519 = X25519();
  static final _aead = Chacha20.poly1305Aead();

  static final _kemId = _suite('KEM', const [0x00, 0x20]);
  static final _hpkeId = _suite('HPKE', const [
    0x00, 0x20, // DHKEM(X25519, HKDF-SHA256)
    0x00, 0x01, // HKDF-SHA256
    0x00, 0x03, // ChaCha20Poly1305
  ]);

  static Uint8List _suite(String name, List<int> ids) =>
      Uint8List.fromList([...name.codeUnits, ...ids]);

  static final _v1 = 'HPKE-v1'.codeUnits;

  /// Seals [plaintext] to the raw X25519 public key [recipient] (32 bytes).
  static Future<Uint8List> seal(
    List<int> recipient,
    List<int> plaintext, {
    List<int>? infoBytes,
    List<int> aad = const [],
    // Tests only: the RFC vectors' fixed ephemeral key material.
    List<int>? ephemeralIkm,
  }) async {
    if (recipient.length != 32) {
      throw ArgumentError.value(recipient.length, 'recipient', 'not 32 bytes');
    }
    final ephemeral = ephemeralIkm == null
        ? await _x25519.newKeyPair()
        : await _x25519.newKeyPairFromSeed(deriveSecretKey(ephemeralIkm));
    final enc = (await ephemeral.extractPublicKey()).bytes;
    final dh = await (await _x25519.sharedSecretKey(
      keyPair: ephemeral,
      remotePublicKey: SimplePublicKey(recipient, type: KeyPairType.x25519),
    ))
        .extractBytes();
    final shared = _sharedSecret(dh, [...enc, ...recipient]);
    final (key, nonce) = _keySchedule(shared, infoBytes ?? info);
    final box = await _aead.encrypt(
      plaintext,
      secretKey: SecretKey(key),
      nonce: nonce,
      aad: aad,
    );
    return Uint8List.fromList([...enc, ...box.cipherText, ...box.mac.bytes]);
  }

  /// Opens what [seal] made, with the raw private key [secretKey]. Null on
  /// any failure (wrong key, changed bytes).
  static Future<Uint8List?> open(
    List<int> secretKey,
    List<int> sealed, {
    List<int>? infoBytes,
    List<int> aad = const [],
  }) async {
    if (sealed.length < 32 + 16) return null;
    try {
      final pair = await _x25519.newKeyPairFromSeed(secretKey);
      final mine = (await pair.extractPublicKey()).bytes;
      final enc = sealed.sublist(0, 32);
      final dh = await (await _x25519.sharedSecretKey(
        keyPair: pair,
        remotePublicKey: SimplePublicKey(enc, type: KeyPairType.x25519),
      ))
          .extractBytes();
      final shared = _sharedSecret(dh, [...enc, ...mine]);
      final (key, nonce) = _keySchedule(shared, infoBytes ?? info);
      final body = sealed.sublist(32);
      final plain = await _aead.decrypt(
        SecretBox(
          body.sublist(0, body.length - 16),
          nonce: nonce,
          mac: Mac(body.sublist(body.length - 16)),
        ),
        secretKey: SecretKey(key),
        aad: aad,
      );
      return Uint8List.fromList(plain);
    } on Object {
      return null;
    }
  }

  /// RFC 9180 §7.1.3 DeriveKeyPair for X25519: the private key from [ikm].
  static Uint8List deriveSecretKey(List<int> ikm) {
    final prk = _labeledExtract(_kemId, const [], 'dkp_prk', ikm);
    return _labeledExpand(_kemId, prk, 'sk', const [], 32);
  }

  /// The public key of a raw private key (tests and key set-up).
  static Future<Uint8List> publicKeyOf(List<int> secretKey) async {
    final pair = await _x25519.newKeyPairFromSeed(secretKey);
    return Uint8List.fromList((await pair.extractPublicKey()).bytes);
  }

  // §4.1 ExtractAndExpand.
  static Uint8List _sharedSecret(List<int> dh, List<int> kemContext) {
    final prk = _labeledExtract(_kemId, const [], 'eae_prk', dh);
    return _labeledExpand(_kemId, prk, 'shared_secret', kemContext, 32);
  }

  // §5.1 KeySchedule, mode_base (no PSK).
  static (Uint8List, Uint8List) _keySchedule(
    List<int> shared,
    List<int> infoBytes,
  ) {
    final pskIdHash =
        _labeledExtract(_hpkeId, const [], 'psk_id_hash', const []);
    final infoHash =
        _labeledExtract(_hpkeId, const [], 'info_hash', infoBytes);
    final context = [0x00, ...pskIdHash, ...infoHash];
    final secret = _labeledExtract(_hpkeId, shared, 'secret', const []);
    return (
      _labeledExpand(_hpkeId, secret, 'key', context, 32),
      _labeledExpand(_hpkeId, secret, 'base_nonce', context, 12),
    );
  }

  static Uint8List _labeledExtract(
    List<int> suite,
    List<int> salt,
    String label,
    List<int> ikm,
  ) =>
      _extract(salt, [..._v1, ...suite, ...label.codeUnits, ...ikm]);

  static Uint8List _labeledExpand(
    List<int> suite,
    List<int> prk,
    String label,
    List<int> infoBytes,
    int length,
  ) =>
      _expand(
        prk,
        [
          (length >> 8) & 0xff,
          length & 0xff,
          ..._v1,
          ...suite,
          ...label.codeUnits,
          ...infoBytes,
        ],
        length,
      );

  // RFC 5869 HKDF-Extract / HKDF-Expand with HMAC-SHA256.
  static Uint8List _extract(List<int> salt, List<int> ikm) =>
      Uint8List.fromList(
        c.Hmac(c.sha256, salt.isEmpty ? List.filled(32, 0) : salt)
            .convert(ikm)
            .bytes,
      );

  static Uint8List _expand(List<int> prk, List<int> infoBytes, int length) {
    final out = <int>[];
    var t = <int>[];
    for (var i = 1; out.length < length; i++) {
      t = c.Hmac(c.sha256, prk).convert([...t, ...infoBytes, i]).bytes;
      out.addAll(t);
    }
    return Uint8List.fromList(out.sublist(0, length));
  }
}
