import 'package:flutter/foundation.dart';

/// Owner 2026-10-20 — booking a consultation with an attorney (flag
/// `consultations`). Times are UTC instants; the attorney's own schedule
/// is in [Consultation.attorneyTimezone].
enum ConsultationStatus {
  pending,
  confirmed,
  declined,
  cancelled,
  unknown;

  static ConsultationStatus parse(String? v) => values.firstWhere(
        (e) => e.name == v,
        orElse: () => unknown,
      );
}

/// Which tab of the list: `upcoming` (confirmed, ahead), `pending`
/// (requests waiting for an answer), `past`.
enum ConsultationView {
  upcoming,
  pending,
  past;
}

@immutable
class ConsultationPerson {
  const ConsultationPerson({
    required this.id,
    required this.displayName,
    this.username,
    this.avatarUrl,
  });

  final String id;
  final String displayName;
  final String? username;
  final String? avatarUrl;
}

@immutable
class Consultation {
  const Consultation({
    required this.id,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.viewerIsAttorney,
    required this.counterpart,
    required this.attorneyTimezone,
    required this.canCall,
    this.note,
    this.caseId,
    this.conversationId,
    this.cancelReason,
    this.cancelledBy,
  });

  final String id;
  final ConsultationStatus status;
  final DateTime startsAt;
  final DateTime endsAt;
  final bool viewerIsAttorney;
  final ConsultationPerson counterpart;
  final String attorneyTimezone;
  final bool canCall;
  final String? note;
  final String? caseId;
  final String? conversationId;
  final String? cancelReason;

  /// `attorney` | `client` | `system`.
  final String? cancelledBy;

  bool get isOpen =>
      status == ConsultationStatus.pending ||
      status == ConsultationStatus.confirmed;

  /// The attorney can answer a request.
  bool get canAnswer =>
      viewerIsAttorney && status == ConsultationStatus.pending;

  /// Either side can cancel or move an open booking.
  bool get canChange => isOpen && endsAt.isAfter(DateTime.now());

  Duration get length => endsAt.difference(startsAt);
}

@immutable
class ConsultationWindow {
  const ConsultationWindow({
    required this.weekday,
    required this.startMinute,
    required this.endMinute,
  });

  /// ISO weekday: 1 = Monday … 7 = Sunday.
  final int weekday;
  final int startMinute;
  final int endMinute;

  @override
  bool operator ==(Object other) =>
      other is ConsultationWindow &&
      other.weekday == weekday &&
      other.startMinute == startMinute &&
      other.endMinute == endMinute;

  @override
  int get hashCode => Object.hash(weekday, startMinute, endMinute);
}

@immutable
class ConsultationTimeOff {
  const ConsultationTimeOff({
    required this.startsOn,
    required this.endsOn,
    this.note,
  });

  /// `YYYY-MM-DD`, attorney's local days.
  final String startsOn;
  final String endsOn;
  final String? note;
}

@immutable
class ConsultationSettings {
  const ConsultationSettings({
    required this.enabled,
    required this.slotMinutes,
    required this.bufferMinutes,
    required this.minNoticeHours,
    required this.horizonDays,
    required this.autoConfirm,
    required this.timezone,
    required this.windows,
    required this.timeOff,
    required this.bookable,
    this.notBookableReason,
  });

  final bool enabled;
  final int slotMinutes;
  final int bufferMinutes;
  final int minNoticeHours;
  final int horizonDays;
  final bool autoConfirm;
  final String? timezone;
  final List<ConsultationWindow> windows;
  final List<ConsultationTimeOff> timeOff;
  final bool bookable;

  /// `not_verified` | `no_subscription` | `no_hours` | `no_timezone`.
  final String? notBookableReason;
}

/// Free starts for a range of attorney-local days.
@immutable
class ConsultationSlots {
  const ConsultationSlots({
    required this.timezone,
    required this.slotMinutes,
    required this.autoConfirm,
    required this.from,
    required this.lastDate,
    required this.slots,
  });

  final String timezone;
  final int slotMinutes;
  final bool autoConfirm;

  /// First day asked for (`YYYY-MM-DD`, attorney local).
  final String from;

  /// Last bookable day (`YYYY-MM-DD`, attorney local).
  final String lastDate;
  final List<ConsultationSlot> slots;

  /// Attorney-local days that have at least one start, sorted.
  List<String> get days =>
      {for (final s in slots) s.localDate}.toList()..sort();

  List<ConsultationSlot> on(String localDate) => [
        for (final s in slots)
          if (s.localDate == localDate) s,
      ];
}

@immutable
class ConsultationSlot {
  const ConsultationSlot({required this.startsAt, required this.local});

  /// The instant (UTC).
  final DateTime startsAt;

  /// The wall clock at the attorney (`YYYY-MM-DDTHH:mm`).
  final String local;

  String get localDate => local.substring(0, 10);

  /// The attorney's wall clock as a plain (zone-less) date-time — only for
  /// formatting; never compare it with real instants.
  DateTime get localClock => DateTime.parse(local);
}

/// `YYYY-MM-DD` of [d] (its own calendar day, no zone maths).
String isoDay(DateTime d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year.toString().padLeft(4, '0')}-${two(d.month)}-${two(d.day)}';
}

/// Whole days after [iso] (`YYYY-MM-DD`), calendar arithmetic.
String addIsoDays(String iso, int days) {
  final d = DateTime.utc(
    int.parse(iso.substring(0, 4)),
    int.parse(iso.substring(5, 7)),
    int.parse(iso.substring(8, 10)),
  ).add(Duration(days: days));
  return isoDay(d);
}

DateTime isoDayToDate(String iso) => DateTime(
      int.parse(iso.substring(0, 4)),
      int.parse(iso.substring(5, 7)),
      int.parse(iso.substring(8, 10)),
    );
