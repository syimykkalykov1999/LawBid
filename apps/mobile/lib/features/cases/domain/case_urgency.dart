import 'package:flutter/foundation.dart';
import 'package:lawbid_api/lawbid_api.dart'
    show CaseDeadlineKind, CaseUrgency, CaseUrgencyLevel;

export 'package:lawbid_api/lawbid_api.dart'
    show CaseDeadlineKind, CaseUrgency, CaseUrgencyLevel;

/// Owner 2026-10-05: what the urgency picker offers, calmest first. The
/// API values; `by_date` asks for a date (court hearing, filing deadline…).
const List<String> kCaseUrgencyChoices = [
  'flexible',
  'within_month',
  'soon',
  'urgent',
  'very_urgent',
  'by_date',
];

/// What the date is, in the order the picker shows them.
const List<String> kCaseDeadlineKinds = [
  'court_hearing',
  'filing_deadline',
  'meeting',
  'signing',
  'other',
];

/// A date at most this far ahead (the API refuses later ones).
const int kCaseDeadlineMaxDays = 730;

/// `YYYY-MM-DD` of a calendar day.
String isoDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// Parses `YYYY-MM-DD` (or an ISO date-time) to that calendar day, local.
DateTime? parseIsoDay(String? s) {
  if (s == null || s.length < 10) return null;
  final d = DateTime.tryParse(s.substring(0, 10));
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

/// Owner 2026-10-05: a case's urgency as the API reports it — the client's
/// choice (a level or `by_date`), the level the case reads as today
/// (computed by the server from the days left for a dated case, with the
/// admin's thresholds) and the date with what it is.
@immutable
class CaseUrgencyInfo {
  const CaseUrgencyInfo({this.choice, this.level, this.deadline, this.kind});

  /// Drops values this build does not know yet (`$unknown`).
  factory CaseUrgencyInfo.of({
    CaseUrgency? urgency,
    CaseUrgencyLevel? level,
    DateTime? deadlineAt,
    CaseDeadlineKind? kind,
  }) =>
      CaseUrgencyInfo(
        choice: urgency == CaseUrgency.$unknown ? null : urgency,
        level: level == CaseUrgencyLevel.$unknown ? null : level,
        deadline: deadlineAt == null
            ? null
            : DateTime(deadlineAt.year, deadlineAt.month, deadlineAt.day),
        kind: kind == CaseDeadlineKind.$unknown ? null : kind,
      );

  static const none = CaseUrgencyInfo();

  final CaseUrgency? choice;
  final CaseUrgencyLevel? level;

  /// The calendar day (local midnight), when the client set a date.
  final DateTime? deadline;
  final CaseDeadlineKind? kind;

  bool get isSet => choice != null || deadline != null;

  /// Whole days from today to the date (negative once it passed).
  int? daysLeft([DateTime? now]) {
    final d = deadline;
    if (d == null) return null;
    final n = now ?? DateTime.now();
    return DateTime.utc(d.year, d.month, d.day)
        .difference(DateTime.utc(n.year, n.month, n.day))
        .inDays;
  }

  /// The level to show: the server's, else the chosen level itself.
  CaseUrgencyLevel? get shownLevel =>
      level ??
      switch (choice) {
        CaseUrgency.flexible => CaseUrgencyLevel.flexible,
        CaseUrgency.withinMonth => CaseUrgencyLevel.withinMonth,
        CaseUrgency.soon => CaseUrgencyLevel.soon,
        CaseUrgency.urgent => CaseUrgencyLevel.urgent,
        CaseUrgency.veryUrgent => CaseUrgencyLevel.veryUrgent,
        _ => null,
      };

  /// Urgent or very urgent today (the red timer on cards).
  bool get isUrgent =>
      shownLevel == CaseUrgencyLevel.urgent ||
      shownLevel == CaseUrgencyLevel.veryUrgent;

  @override
  bool operator ==(Object other) =>
      other is CaseUrgencyInfo &&
      other.choice == choice &&
      other.level == level &&
      other.deadline == deadline &&
      other.kind == kind;

  @override
  int get hashCode => Object.hash(choice, level, deadline, kind);
}
