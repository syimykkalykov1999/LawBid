// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'dispute_refund_status.dart';

part 'admin_dispute_refund_dto.g.dart';

@JsonSerializable()
class AdminDisputeRefundDto {
  const AdminDisputeRefundDto({
    required this.id,
    required this.disputeId,
    required this.userId,
    required this.user,
    required this.paymentId,
    required this.status,
    required this.reason,
    required this.amountCents,
    required this.currency,
    required this.refundId,
    required this.note,
    required this.createdAt,
  });

  factory AdminDisputeRefundDto.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeRefundDtoFromJson(json);

  final String id;
  final String disputeId;
  final String userId;
  final AdminBillingUserDto? user;
  final String paymentId;
  final DisputeRefundStatus status;

  /// Why it waits or was not refunded (over_amount, user_limit, daily_cap, prior_dispute, fraud_review, escalated, closed, refund_failed, refund_unknown, refund_unavailable).
  final String? reason;
  final int amountCents;
  final String currency;
  final String? refundId;
  final String? note;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminDisputeRefundDtoToJson(this);
}
