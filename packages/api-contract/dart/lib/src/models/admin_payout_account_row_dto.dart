// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_party_dto.dart';
import 'payout_account_status.dart';

part 'admin_payout_account_row_dto.g.dart';

@JsonSerializable()
class AdminPayoutAccountRowDto {
  const AdminPayoutAccountRowDto({
    required this.userId,
    required this.user,
    required this.email,
    required this.stripeAccountId,
    required this.status,
    required this.chargesEnabled,
    required this.payoutsEnabled,
    required this.requirementsDue,
    required this.disabledReason,
    required this.receivedCents,
    required this.lastSyncedAt,
    required this.createdAt,
  });

  factory AdminPayoutAccountRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminPayoutAccountRowDtoFromJson(json);

  final String userId;
  final CasePaymentPartyDto? user;
  final String? email;
  final String stripeAccountId;
  final PayoutAccountStatus status;
  final bool chargesEnabled;
  final bool payoutsEnabled;
  final List<String> requirementsDue;
  final String? disabledReason;

  /// Succeeded payments, all time.
  final int receivedCents;
  final DateTime? lastSyncedAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminPayoutAccountRowDtoToJson(this);
}
