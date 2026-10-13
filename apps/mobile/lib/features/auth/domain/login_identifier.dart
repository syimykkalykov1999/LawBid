import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';

/// What the sign-in field holds (owner 2026-10-13: one field takes a phone
/// number or an e-mail).
class LoginIdentifier {
  const LoginIdentifier._(this.value, this.isEmail);

  /// E.164 phone number, or a lower-case e-mail address.
  final String value;
  final bool isEmail;

  /// Parses what the person typed, or null while it is neither a plausible
  /// e-mail nor a phone number (a bare US number gets +1).
  static LoginIdentifier? tryParse(String raw) {
    final text = raw.trim();
    if (text.contains('@')) {
      return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(text)
          ? LoginIdentifier._(text.toLowerCase(), true)
          : null;
    }
    final phone = normalizeToE164(text);
    return phone == null ? null : LoginIdentifier._(phone, false);
  }
}

/// Owner 2026-10-13: the password rule shown on the screens (8+ chars).
const minPasswordLength = 8;
const maxPasswordLength = 128;

bool isAcceptablePassword(String value) =>
    value.length >= minPasswordLength && value.length <= maxPasswordLength;
