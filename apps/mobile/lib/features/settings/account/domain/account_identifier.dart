import 'package:flutter/foundation.dart';

/// Sign-in method kinds (docs/01 §10.3: `phone`, `email`, `apple_sub`,
/// `google_sub`) — apps/api `IdentifierType`.
enum IdentifierProvider {
  phone,
  email,
  apple,
  google;

  static IdentifierProvider? tryParse(String? raw) =>
      raw == null ? null : IdentifierProvider.values.asNameMap()[raw];

  bool get isSocial =>
      this == IdentifierProvider.apple || this == IdentifierProvider.google;
}

/// One row of `GET /users/me/identifiers`.
@immutable
class AccountIdentifier {
  const AccountIdentifier({
    required this.id,
    required this.provider,
    required this.verified,
    required this.isPrimaryContact,
    this.value,
  });

  /// Null for an unknown provider (a newer server) — the caller skips it.
  static AccountIdentifier? tryFromJson(Map<String, dynamic> json) {
    final provider = IdentifierProvider.tryParse(json['provider'] as String?);
    final id = json['id'];
    if (provider == null || id is! String) return null;
    return AccountIdentifier(
      id: id,
      provider: provider,
      value: json['value'] as String?,
      verified: json['verified'] as bool? ?? false,
      isPrimaryContact: json['isPrimaryContact'] as bool? ?? false,
    );
  }

  final String id;
  final IdentifierProvider provider;

  /// The phone (E.164) / email; null for Apple/Google (the server never
  /// echoes the provider's opaque user id).
  final String? value;
  final bool verified;

  /// The account's phone/email contact (users.phone_e164 / users.email).
  final bool isPrimaryContact;
}

/// Outcome of connecting Apple/Google from Settings → Account.
enum SocialLinkOutcome { linked, cancelled }
