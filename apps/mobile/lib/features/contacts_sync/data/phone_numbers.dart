import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

/// Owner 2026-10-13 (contacts sync): turns a phone-book entry into the
/// E.164 number the server hashes, or null when it cannot be told safely.
///
/// - "+1 (415) 555-2680", "001 415 555 2680" → "+14155552680";
/// - a number in national format ("8 912 …", "0555 …", "07…") is read in the
///   country of the account number ([region], ISO 3166 alpha-2) — like
///   WhatsApp: the leading 0/8 goes, the country code comes;
/// - without a [region], or in the US/Canada, a bare 10-digit number (or 11
///   with a leading 1) → "+1…";
/// - any other number without a country code is skipped, not guessed;
/// - extensions ("x123", ";", ",", "#") are cut off.
String? normalizeToE164(String raw, {String? region}) {
  final head = raw.trim().split(RegExp('[xX;,#]')).first.trim();
  var digits = head.replaceAll(RegExp('[^0-9]'), '');
  if (digits.isEmpty) return null;
  final upper = region?.toUpperCase();
  if (upper != null && !head.startsWith('+') && !digits.startsWith('00')) {
    final iso = IsoCode.values.asNameMap()[upper];
    if (iso != null) {
      try {
        final parsed = PhoneNumber.parse(head, callerCountry: iso);
        if (parsed.isValid()) return parsed.international;
      } on Object {
        // Not a number in that country: the rules below decide.
      }
      if (upper != 'US' && upper != 'CA') return null;
    }
  }
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
Set<String> contactHashes(
  Iterable<String> rawNumbers, {
  String? ownNumber,
  String? region,
}) {
  final out = <String>{};
  for (final raw in rawNumbers) {
    final e164 = normalizeToE164(raw, region: region);
    if (e164 == null || e164 == ownNumber) continue;
    out.add(hashE164(e164));
  }
  return out;
}

/// Input of [hashPhoneBook]: the numbers of each phone-book entry.
typedef PhoneBookJob = ({List<List<String>> numbers, String? region});

/// For every distinct hash the index of the first entry that has it. A
/// top-level function so a book of thousands of numbers is normalized and
/// hashed off the main thread (`compute`).
Map<String, int> hashPhoneBook(PhoneBookJob job) {
  final out = <String, int>{};
  for (var i = 0; i < job.numbers.length; i++) {
    for (final raw in job.numbers[i]) {
      final e164 = normalizeToE164(raw, region: job.region);
      if (e164 != null) out.putIfAbsent(hashE164(e164), () => i);
    }
  }
  return out;
}
