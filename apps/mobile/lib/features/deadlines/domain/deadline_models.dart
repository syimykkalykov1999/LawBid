import 'package:flutter/foundation.dart';

/// Owner 2026-10-20: the deadline calculator — a rule (a court deadline or
/// a statute of limitations) and the date counted from an event.
enum DeadlineKind {
  court,
  statute;

  String get wire =>
      this == DeadlineKind.court ? 'court_deadline' : 'statute_of_limitations';

  static DeadlineKind parse(String? raw) => switch (raw) {
        'statute_of_limitations' || 'statute' => DeadlineKind.statute,
        _ => DeadlineKind.court,
      };
}

/// `{"en": "...", "ru": "..."}` → the user's language, else English, else
/// any text.
String pickLabel(Map<String, String>? labels, String locale) {
  if (labels == null || labels.isEmpty) return '';
  return labels[locale] ?? labels['en'] ?? labels.values.first;
}

@immutable
class DeadlineRule {
  const DeadlineRule({
    required this.code,
    required this.jurisdiction,
    required this.kind,
    required this.labels,
    required this.amount,
    required this.unit,
    required this.dayType,
    required this.direction,
    required this.verified,
    this.practiceCode,
    this.citation,
    this.notes,
  });

  final String code;

  /// `US` = federal courts; otherwise a state code.
  final String jurisdiction;
  final DeadlineKind kind;
  final Map<String, String> labels;
  final int amount;

  /// `day`, `month` or `year`.
  final String unit;

  /// `calendar` or `business`.
  final String dayType;

  /// `after` or `before` the event.
  final String direction;
  final bool verified;
  final String? practiceCode;
  final String? citation;
  final Map<String, String>? notes;

  String label(String locale) => pickLabel(labels, locale);
  String note(String locale) => pickLabel(notes, locale);
}

@immutable
class DeadlineHoliday {
  const DeadlineHoliday({required this.date, required this.names});

  final DateTime date;
  final Map<String, String> names;

  String name(String locale) => pickLabel(names, locale);
}

@immutable
class DeadlineResult {
  const DeadlineResult({
    required this.rule,
    required this.eventDate,
    required this.dueDate,
    required this.rawDate,
    required this.rolled,
    required this.holidays,
    required this.warnings,
  });

  final DeadlineRule rule;
  final DateTime eventDate;

  /// The last day.
  final DateTime dueDate;

  /// Before moving past a weekend or a holiday.
  final DateTime rawDate;
  final bool rolled;
  final List<DeadlineHoliday> holidays;

  /// `holidays_missing`, `unverified`, `rolled`.
  final Set<String> warnings;
}

/// `2026-10-26` → a local calendar date (no time zone shift).
DateTime parseDeadlineDate(String iso) {
  final p = iso.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

String deadlineDateIso(DateTime d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year.toString().padLeft(4, '0')}-${two(d.month)}-${two(d.day)}';
}

/// Query of the result provider — a rule and an event date.
@immutable
class DeadlineQuery {
  const DeadlineQuery(this.ruleCode, this.eventDate);

  final String ruleCode;
  final String eventDate;

  @override
  bool operator ==(Object other) =>
      other is DeadlineQuery &&
      other.ruleCode == ruleCode &&
      other.eventDate == eventDate;

  @override
  int get hashCode => Object.hash(ruleCode, eventDate);
}
