import 'package:flutter/foundation.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// Owner 2026-10-05: where a client's invite stands.
enum InviteStatus {
  pending,
  accepted,
  declined,
  cancelled,
  expired,
  closed;

  static InviteStatus fromJson(String? v) => InviteStatus.values
      .firstWhere((s) => s.name == v, orElse: () => InviteStatus.closed);
}

/// Owner 2026-10-05: a client offered one of their open cases to an
/// attorney ("Предложить дело"). The attorney answers with an ordinary bid
/// (which marks it accepted) or declines; the client may cancel it.
@immutable
class CaseInvite {
  const CaseInvite({
    required this.id,
    required this.caseId,
    required this.attorneyId,
    required this.status,
    required this.expiresAt,
    required this.createdAt,
    required this.caseTitle,
    required this.casePracticeKey,
    required this.caseStateCodes,
    this.message,
    this.budgetCents,
    this.declineReason,
    this.outsidePractice = false,
    this.outsideLicensedStates = false,
    this.bidId,
    this.attorney,
  });

  final String id;
  final String caseId;
  final String attorneyId;
  final InviteStatus status;
  final String? message;

  /// The budget the client proposes, in cents.
  final int? budgetCents;
  final String? declineReason;
  final bool outsidePractice;
  final bool outsideLicensedStates;

  /// The attorney's bid that answered the invite.
  final String? bidId;
  final DateTime expiresAt;
  final DateTime createdAt;
  final String caseTitle;
  final String casePracticeKey;
  final List<String> caseStateCodes;

  /// The invited attorney (the client's view only).
  final BidAttorney? attorney;

  bool get isPending => status == InviteStatus.pending;
}
