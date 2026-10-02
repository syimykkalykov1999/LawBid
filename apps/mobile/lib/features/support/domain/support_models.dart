import 'package:flutter/foundation.dart';

/// Owner 2026-10-02 — help & support: a ticket is a thread between the
/// user and the LawBid team.
enum SupportCategory {
  account,
  billing,
  verification,
  caseIssue('case'),
  bug,
  abuse,
  other;

  const SupportCategory([this._wire]);
  final String? _wire;

  String get wire => _wire ?? name;

  static SupportCategory from(String? v) => SupportCategory.values.firstWhere(
        (c) => c.wire == v,
        orElse: () => SupportCategory.other,
      );
}

/// open · waiting_user (the team answered) · resolved · closed.
enum SupportStatus {
  open,
  waitingUser('waiting_user'),
  resolved,
  closed;

  const SupportStatus([this._wire]);
  final String? _wire;

  String get wire => _wire ?? name;

  static SupportStatus from(String? v) => SupportStatus.values.firstWhere(
        (s) => s.wire == v,
        orElse: () => SupportStatus.open,
      );
}

@immutable
class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.fromTeam,
    required this.body,
    required this.createdAt,
    this.authorName,
  });

  final String id;
  final bool fromTeam;
  final String body;
  final DateTime createdAt;
  final String? authorName;
}

@immutable
class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.subject,
    required this.category,
    required this.status,
    required this.unread,
    required this.canReply,
    required this.lastMessageAt,
    required this.createdAt,
    this.messages = const [],
  });

  final String id;
  final String subject;
  final SupportCategory category;
  final SupportStatus status;

  /// The team wrote and the user has not opened it yet.
  final bool unread;
  final bool canReply;
  final DateTime lastMessageAt;
  final DateTime createdAt;
  final List<SupportMessage> messages;

  bool get isOpen =>
      status == SupportStatus.open || status == SupportStatus.waitingUser;
}
