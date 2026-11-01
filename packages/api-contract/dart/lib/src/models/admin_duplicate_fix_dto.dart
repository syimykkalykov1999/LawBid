// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'admin_duplicate_fix_dto_trigger.dart';
import 'duplicate_subscription_fix_status.dart';

part 'admin_duplicate_fix_dto.g.dart';

@JsonSerializable()
class AdminDuplicateFixDto {
  const AdminDuplicateFixDto({
    required this.id,
    required this.userId,
    required this.user,
    required this.keptSubscriptionId,
    required this.duplicateSubscriptionId,
    required this.trigger,
    required this.status,
    required this.reason,
    required this.chargedCents,
    required this.refundCents,
    required this.currency,
    required this.refundId,
    required this.canceledAt,
    required this.createdAt,
  });

  factory AdminDuplicateFixDto.fromJson(Map<String, Object?> json) =>
      _$AdminDuplicateFixDtoFromJson(json);

  final String id;
  final String userId;
  final AdminBillingUserDto? user;

  /// The Stripe subscription that stays.
  final String keptSubscriptionId;

  /// The duplicate (cancelled unless blocked).
  final String duplicateSubscriptionId;
  final AdminDuplicateFixDtoTrigger trigger;
  final DuplicateSubscriptionFixStatus status;

  /// Why there is no automatic refund (no_charge, period_over, dispute, fraud_review, daily_cap, nth_duplicate, switch_off, refund_failed …).
  final String? reason;

  /// What the duplicate's last invoice charged.
  final int chargedCents;

  /// Refunded (or proposed, when held for a person).
  final int refundCents;
  final String currency;
  final String? refundId;
  final DateTime? canceledAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminDuplicateFixDtoToJson(this);
}
