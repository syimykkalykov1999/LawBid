// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_subscription_refund_outcome_dto.dart';

part 'admin_subscription_action_result_dto.g.dart';

@JsonSerializable()
class AdminSubscriptionActionResultDto {
  const AdminSubscriptionActionResultDto({
    required this.status,
    required this.cancelAtPeriodEnd,
    required this.accessEndsAt,
    required this.refund,
  });

  factory AdminSubscriptionActionResultDto.fromJson(
    Map<String, Object?> json,
  ) => _$AdminSubscriptionActionResultDtoFromJson(json);

  final String status;
  final bool cancelAtPeriodEnd;

  /// When access ends (null: it renews).
  final DateTime? accessEndsAt;
  final AdminSubscriptionRefundOutcomeDto? refund;

  Map<String, Object?> toJson() =>
      _$AdminSubscriptionActionResultDtoToJson(this);
}
