// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_case_payment_stats_dto.g.dart';

@JsonSerializable()
class AdminCasePaymentStatsDto {
  const AdminCasePaymentStatsDto({
    required this.volume30dCents,
    required this.count30d,
    required this.platformFees30dCents,
    required this.refunded30dCents,
    required this.disputedOpen,
    required this.pendingPayments,
    required this.payoutAccountsActive,
    required this.payoutAccountsPending,
    required this.volumeAllCents,
    required this.platformFeesAllCents,
    required this.openRequests,
    required this.openRequestsCents,
    required this.overdueRequests,
  });

  factory AdminCasePaymentStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminCasePaymentStatsDtoFromJson(json);

  /// Succeeded, last 30 days.
  final int volume30dCents;
  final int count30d;

  /// Platform fees, 30 days.
  final int platformFees30dCents;
  final int refunded30dCents;
  final int disputedOpen;
  final int pendingPayments;
  final int payoutAccountsActive;
  final int payoutAccountsPending;

  /// All-time succeeded.
  final int volumeAllCents;
  final int platformFeesAllCents;

  /// Open payment requests.
  final int openRequests;
  final int openRequestsCents;
  final int overdueRequests;

  Map<String, Object?> toJson() => _$AdminCasePaymentStatsDtoToJson(this);
}
