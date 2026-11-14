import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

/// Detective R2 item 3 (14.11): a money field read «1,500» (US thousands)
/// as `1.500` → $1.50, and «1,500.50» not at all (`replaceAll(',', '.')`
/// then `double.tryParse`). A locale-aware currency field as in the Stripe
/// Dashboard: the number is parsed by intl's
/// `NumberFormat.decimalPattern(locale).parse` (BSD-3).
///
/// * Spaces of any kind are digit grouping («1 500,50», «1 500.50»).
/// * The locale's decimal mark is the decimal mark («1,500.50» in en,
///   «1500,5» in ru).
/// * The other mark, once and followed by one or two digits at the end, is
///   taken as the decimal mark too — a ru user typing «1500.5», an en user
///   typing «12,50». Followed by three digits it is grouping («1,500»).
///
/// Returns whole cents, or null when the text is not a positive amount.
int? parseMoneyCents(String text, {required String locale}) {
  var s = text.replaceAll(RegExp(r'[\s  ]'), '');
  if (s.isEmpty) return null;
  final symbols = NumberFormat.decimalPattern(locale).symbols;
  final decimal = symbols.DECIMAL_SEP;
  final group = symbols.GROUP_SEP;
  final other = decimal == '.' ? ',' : '.';
  if (!s.contains(decimal) &&
      other.allMatches(s).length == 1 &&
      RegExp('${RegExp.escape(other)}[0-9]{1,2}\$').hasMatch(s)) {
    s = s.replaceFirst(other, decimal);
  } else if (group.trim().isEmpty || group == ' ' || group == ' ') {
    // The locale groups with a space (removed above): the other mark can
    // only be grouping here.
    s = s.replaceAll(other, '');
  }
  if (!RegExp('^[0-9${RegExp.escape(decimal)}${RegExp.escape(group)}'
          '${RegExp.escape(other)}]+\$')
      .hasMatch(s)) {
    return null;
  }
  final num value;
  try {
    value = NumberFormat.decimalPattern(locale).parse(s);
  } on FormatException {
    return null;
  }
  if (value.isNaN || value.isInfinite || value <= 0) return null;
  return (value * 100).round();
}

/// Digits, both marks and spaces (grouping) — what [parseMoneyCents] reads.
final moneyInputFormatter =
    FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\s  ]'));
