import 'package:flutter/foundation.dart';

/// Owner 2026-10-22 (checklist §1, passkeys): one registered passkey of the
/// account (`GET /users/me/passkeys`).
@immutable
class PasskeyInfo {
  const PasskeyInfo({
    required this.id,
    required this.name,
    required this.createdAt,
    this.lastUsedAt,
    this.backedUp = false,
  });

  /// The server's row id (also the credential id), used by DELETE.
  final String id;

  /// A readable name («iPhone», «Pixel 9», a security key).
  final String name;
  final DateTime createdAt;
  final DateTime? lastUsedAt;

  /// Synced in the platform's password manager (iCloud Keychain / Google
  /// Password Manager) — survives a lost phone.
  final bool backedUp;
}

/// What a sign-in with a passkey ended in.
enum PasskeySignInStatus {
  /// Tokens issued; the session is set.
  success,

  /// The person closed the system dialog — nothing to show.
  cancelled,

  /// No passkey for LawBid on this device / in its password manager.
  noCredentials,

  /// The device, OS or domain association cannot do passkeys.
  unsupported,

  /// The server refused or the network failed; `PasskeySignInResult.error`
  /// carries why.
  failed,
}

@immutable
class PasskeySignInResult {
  const PasskeySignInResult(this.status, [this.error]);

  final PasskeySignInStatus status;
  final Object? error;

  bool get isSuccess => status == PasskeySignInStatus.success;
}
