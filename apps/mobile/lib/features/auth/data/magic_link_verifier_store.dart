import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kVerifierKey = 'magic_link_verifier';

/// Device binding for the email magic link (docs/01_FOUNDATION_AUTH.md
/// §10.2 E, security review 2026-09-27). Every email login-code request
/// creates a fresh random verifier that stays in the OS keychain/keystore;
/// only its SHA-256 (`linkChallenge`) goes to the server. The emailed link
/// carries a one-time token that `POST /auth/otp/verify-link` accepts only
/// together with this verifier — so a leaked or forwarded link cannot sign
/// anyone in on another device.
class MagicLinkVerifierStore {
  MagicLinkVerifierStore([FlutterSecureStorage? storage, Random? random])
    : _storage = storage ?? const FlutterSecureStorage(),
      _random = random ?? Random.secure();

  final FlutterSecureStorage _storage;
  final Random _random;

  /// Generates and stores a new verifier (replacing any previous one) and
  /// returns its challenge for `OtpRequestDto.linkChallenge`.
  Future<String> createChallenge() async {
    final verifier = _base64UrlNoPad(List<int>.generate(32, (_) => _random.nextInt(256)));
    await _storage.write(key: _kVerifierKey, value: verifier);
    return challengeFor(verifier);
  }

  /// The verifier of the last email code request on this device, or null
  /// (none requested here, already used, or the app was reinstalled).
  Future<String?> read() => _storage.read(key: _kVerifierKey);

  /// Forgets the verifier (after a successful sign-in or on logout).
  Future<void> clear() => _storage.delete(key: _kVerifierKey);

  /// base64url (no padding) of SHA-256 over the verifier's ASCII bytes.
  static String challengeFor(String verifier) =>
      _base64UrlNoPad(sha256.convert(ascii.encode(verifier)).bytes);

  static String _base64UrlNoPad(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');
}
