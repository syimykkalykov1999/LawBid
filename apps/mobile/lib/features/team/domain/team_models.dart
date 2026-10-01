import 'package:flutter/foundation.dart';

/// OQ-048: what an attorney gives each assistant (one duty to many
/// assistants, many duties to one).
enum AssistantDuty {
  calls,
  chats,
  files,
  cases,
  bidDrafts,
  posts,
  tasks,
  profile,

  /// OQ-049: place bids and negotiate in the attorney's name.
  bids,

  /// OQ-049: publish posts / news / comments without approval.
  publish;

  String get wire => this == bidDrafts ? 'bid_drafts' : name;

  static AssistantDuty? parse(String raw) {
    for (final d in values) {
      if (d.wire == raw) return d;
    }
    return null;
  }

  static Set<AssistantDuty> parseAll(Iterable<String> raw) =>
      {...raw.map(parse).whereType<AssistantDuty>()};
}

enum MemberStatus { invited, active, removed }

@immutable
class TeamMember {
  const TeamMember({
    required this.id,
    required this.phone,
    required this.status,
    required this.approval,
    required this.duties,
    required this.createdAt,
    this.name,
    this.joinedAt,
    this.liabilityAcceptedAt,
  });

  /// OQ-049: when the attorney last accepted responsibility.
  final DateTime? liabilityAcceptedAt;

  final String id;
  final String phone;
  final String? name;
  final MemberStatus status;

  /// purchase / attorney_added / attorney_otp.
  final String approval;
  final Set<AssistantDuty> duties;
  final DateTime? joinedAt;
  final DateTime createdAt;

  String get label => (name?.trim().isNotEmpty ?? false) ? name! : phone;
}

@immutable
class TeamInfo {
  const TeamInfo({
    required this.members,
    required this.seats,
    required this.used,
    required this.plan,
  });

  final List<TeamMember> members;
  final int seats;
  final int used;

  /// monthly / yearly / none.
  final String plan;

  bool get hasFreeSeat => used < seats;
}

enum AssistantState { none, invited, active }

/// `GET /assistants/me` — the assistant's own view of their team.
@immutable
class AssistantMe {
  const AssistantMe({
    required this.state,
    required this.duties,
    this.membershipId,
    this.attorneyId,
    this.attorneyName,
    this.attorneyUsername,
    this.attorneyAvatarUrl,
  });

  static const none = AssistantMe(state: AssistantState.none, duties: {});

  final AssistantState state;
  final String? membershipId;

  /// The account the assistant acts in (their messages are "mine").
  final String? attorneyId;
  final String? attorneyName;
  final String? attorneyUsername;
  final String? attorneyAvatarUrl;
  final Set<AssistantDuty> duties;

  bool get active => state == AssistantState.active;
  bool can(AssistantDuty d) => active && duties.contains(d);
}

@immutable
class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.membershipId,
    required this.assistantName,
    required this.action,
    required this.createdAt,
    this.targetType,
    this.targetId,
    this.summary,
  });

  final String id;
  final String membershipId;
  final String assistantName;
  final String action;
  final String? targetType;
  final String? targetId;
  final String? summary;
  final DateTime createdAt;
}

enum RequestKind {
  post,
  comment,
  caseComment,
  profileEdit;

  String get wire => switch (this) {
        caseComment => 'case_comment',
        profileEdit => 'profile_edit',
        _ => name,
      };

  static RequestKind parse(String? raw) => switch (raw) {
        'comment' => comment,
        'case_comment' => caseComment,
        'profile_edit' => profileEdit,
        _ => post,
      };
}

enum RequestStatus {
  pending,
  approved,
  rejected;

  static RequestStatus parse(String? raw) => switch (raw) {
        'approved' => approved,
        'rejected' => rejected,
        _ => pending,
      };
}

@immutable
class AssistantRequest {
  const AssistantRequest({
    required this.id,
    required this.membershipId,
    required this.assistantName,
    required this.kind,
    required this.payload,
    required this.status,
    required this.createdAt,
    this.resultId,
    this.note,
    this.decidedAt,
  });

  final String id;
  final String membershipId;
  final String assistantName;
  final RequestKind kind;
  final Map<String, Object?> payload;
  final RequestStatus status;
  final String? resultId;
  final String? note;
  final DateTime createdAt;
  final DateTime? decidedAt;

  String text(String key) {
    final v = payload[key];
    return v is String ? v : '';
  }

  /// One line for lists: the post title, the comment body…
  String get headline => switch (kind) {
        RequestKind.post => text('title'),
        RequestKind.profileEdit =>
          text('bio').isNotEmpty ? text('bio') : payload.keys.join(', '),
        _ => text('body'),
      };
}

/// Owner 2026-10-01: everything an attorney plans, in the order the
/// picker shows them.
enum TaskKind {
  call,
  meeting,
  consultation,
  court,
  hearingPrep,
  deadline,
  filing,
  documents,
  review,
  sign,
  print,
  email,
  deposition,
  mediation,
  visit,
  jailVisit,
  payment,
  research,
  other;

  String get wire => switch (this) {
        hearingPrep => 'hearing_prep',
        jailVisit => 'jail_visit',
        _ => name,
      };

  static TaskKind parse(String? raw) =>
      values.firstWhere((k) => k.wire == raw, orElse: () => other);
}

enum TaskStatus {
  open,
  taken,
  done,
  notDone,
  cancelled;

  String get wire => this == notDone ? 'not_done' : name;

  static TaskStatus parse(String? raw) => switch (raw) {
        'taken' => taken,
        'done' => done,
        'not_done' => notDone,
        'cancelled' => cancelled,
        _ => open,
      };

  bool get active => this == open || this == taken;
}

@immutable
class TaskFile {
  const TaskFile({required this.fileId, this.url, this.mime});

  final String fileId;
  final String? url;
  final String? mime;

  bool get isImage => mime?.startsWith('image/') ?? false;
}

@immutable
class TaskItem {
  const TaskItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.status,
    required this.createdAt,
    this.notes,
    this.dueAt,
    this.location,
    this.caseId,
    this.caseTitle,
    this.contactName,
    this.contactPhone,
    this.files = const [],
    this.outcomeNote,
    this.rescheduledTo,
    this.createdByName,
    this.doneAt,
  });

  final String id;
  final TaskKind kind;
  final String title;
  final String? notes;
  final DateTime? dueAt;
  final String? location;
  final String? caseId;
  final String? caseTitle;
  final String? contactName;
  final String? contactPhone;
  final List<TaskFile> files;
  final TaskStatus status;
  final String? outcomeNote;
  final DateTime? rescheduledTo;

  /// The assistant who set it; null = the attorney's own task.
  final String? createdByName;
  final DateTime createdAt;
  final DateTime? doneAt;

  bool isOverdue(DateTime now) =>
      status.active && dueAt != null && dueAt!.isBefore(now);
}

/// A new task (`POST /tasks`).
@immutable
class TaskDraft {
  const TaskDraft({
    required this.kind,
    required this.title,
    this.notes,
    this.dueAt,
    this.location,
    this.caseId,
    this.contactName,
    this.contactPhone,
    this.fileIds = const [],
  });

  final TaskKind kind;
  final String title;
  final String? notes;
  final DateTime? dueAt;
  final String? location;
  final String? caseId;
  final String? contactName;
  final String? contactPhone;
  final List<String> fileIds;
}

/// A bid an assistant prepared (`/cases/:id/bid-draft`).
@immutable
class BidDraft {
  const BidDraft({
    required this.caseId,
    required this.updatedAt,
    this.feeType,
    this.amountCents,
    this.message,
    this.startAvailability,
    this.startDate,
    this.estimatedDurationDays,
    this.preparedBy,
  });

  final String caseId;
  final String? feeType;
  final int? amountCents;
  final String? message;
  final String? startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;
  final String? preparedBy;
  final DateTime updatedAt;
}
