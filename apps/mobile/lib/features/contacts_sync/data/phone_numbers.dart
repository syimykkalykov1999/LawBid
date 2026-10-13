import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Owner 2026-10-13 (contacts sync): turns a phone-book entry into the
/// E.164 number the server hashes, or null when it cannot be told safely.
///
/// - "+1 (415) 555-2680", "001 415 555 2680" → "+14155552680";
/// - a bare US number (10 digits, or 11 with a leading 1) → "+1…";
/// - any other number without a country code is skipped, not guessed;
/// - extensions ("x123", ";", ",", "#") are cut off.
String? normalizeToE164(String raw) {
  final head = raw.trim().split(RegExp(r'[xX;,#]')).first.trim();
  var digits = head.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return null;
  if (head.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.substring(2);
  } else if (digits.length == 10) {
    digits = '1$digits';
  } else if (!(digits.length == 11 && digits.startsWith('1'))) {
    return null;
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    return null;
  }
  return '+$digits';
}

/// Lowercase hex SHA-256 of an E.164 number — the only form that leaves
/// the phone.
String hashE164(String e164) => sha256.convert(utf8.encode(e164)).toString();

/// The unique hashes of the numbers in [rawNumbers], skipping the ones
/// that cannot be normalized and [ownNumber] (E.164) when given.
Set<String> contactHashes(Iterable<String> rawNumbers, {String? ownNumber}) {
  final out = <String>{};
  for (final raw in rawNumbers) {
    final e164 = normalizeToE164(raw);
    if (e164 == null || e164 == ownNumber) continue;
    out.add(hashE164(e164));
  }
  return out;
}
