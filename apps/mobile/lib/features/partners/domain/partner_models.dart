import 'package:flutter/foundation.dart';

/// Owner 2026-10-05 — partner program: a blogger or agent brings attorneys
/// and clients by their link and is paid per attorney who bought a
/// subscription and per client who hired (rates set in the admin panel).
enum CommissionKind {
  attorneySubscription('attorney_subscription'),
  clientQualified('client_qualified'),
  monthlyBase('monthly_base'),
  adjustment('adjustment'),
  unknown('');

  const CommissionKind(this.wire);
  final String wire;

  static CommissionKind parse(String? v) => CommissionKind.values.firstWhere(
        (k) => k.wire == v,
        orElse: () => CommissionKind.unknown,
      );
}

@immutable
class PartnerRates {
  const PartnerRates({
    required this.attorneyRateCents,
    required this.clientRateCents,
    required this.monthlyBaseCents,
    required this.clientRule,
    required this.holdDays,
  });

  final int attorneyRateCents;
  final int clientRateCents;
  final int monthlyBaseCents;

  /// case_published · bid_accepted.
  final String clientRule;
  final int holdDays;
}

@immutable
class PartnerTotals {
  const PartnerTotals({
    required this.heldCents,
    required this.approvedCents,
    required this.paidCents,
    required this.thisMonthCents,
    required this.referredCount,
    required this.qualifiedCount,
  });

  final int heldCents;
  final int approvedCents;
  final int paidCents;
  final int thisMonthCents;
  final int referredCount;
  final int qualifiedCount;
}

@immutable
class ReferredUser {
  const ReferredUser({
    required this.id,
    required this.name,
    required this.isAttorney,
    required this.status,
    required this.amountCents,
    required this.joinedAt,
    required this.qualifiedAt,
  });

  final String id;
  final String? name;
  final bool isAttorney;

  /// joined · qualified · paid · reversed.
  final String status;
  final int amountCents;
  final DateTime joinedAt;
  final DateTime? qualifiedAt;
}

@immutable
class PartnerCommission {
  const PartnerCommission({
    required this.id,
    required this.kind,
    required this.amountCents,
    required this.status,
    required this.period,
    required this.createdAt,
    required this.holdUntil,
    required this.paidAt,
    required this.note,
  });

  final String id;
  final CommissionKind kind;
  final int amountCents;

  /// held · approved · paid · reversed.
  final String status;
  final String period;
  final DateTime createdAt;
  final DateTime? holdUntil;
  final DateTime? paidAt;
  final String? note;
}

@immutable
class PartnerMe {
  const PartnerMe({
    required this.isPartner,
    required this.status,
    required this.code,
    required this.shareUrl,
    required this.rates,
    required this.totals,
    required this.referred,
    required this.commissions,
    required this.title,
    required this.summary,
  });

  final bool isPartner;

  /// active · paused · ended (null for non-partners).
  final String? status;
  final String code;
  final String shareUrl;
  final PartnerRates rates;
  final PartnerTotals totals;
  final List<ReferredUser> referred;
  final List<PartnerCommission> commissions;
  final String title;
  final String summary;
}
