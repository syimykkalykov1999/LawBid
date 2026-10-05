// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_subscription_refund_outcome_dto_status.dart';

part 'admin_subscription_refund_outcome_dto.g.dart';

@JsonSerializable()
class AdminSubscriptionRefundOutcomeDto {
  const AdminSubscriptionRefundOutcomeDto({
    required this.amountCents,
    required this.status,
    required this.message,
  });

  factory AdminSubscriptionRefundOutcomeDto.fromJson(
    Map<String, Object?> json,
  ) => _$AdminSubscriptionRefundOutcomeDtoFromJson(json);

  final int amountCents;
  final AdminSubscriptionRefundOutcomeDtoStatus status;
  final String? message;

  Map<String, Object?> toJson() =>
      _$AdminSubscriptionRefundOutcomeDtoToJson(this);
}
