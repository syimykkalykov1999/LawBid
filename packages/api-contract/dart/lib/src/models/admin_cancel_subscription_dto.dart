// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_subscription_cancel_refund.dart';
import 'admin_subscription_cancel_when.dart';

part 'admin_cancel_subscription_dto.g.dart';

@JsonSerializable()
class AdminCancelSubscriptionDto {
  const AdminCancelSubscriptionDto({
    required this.whenValue,
    this.reason = '',
    this.refund = AdminSubscriptionCancelRefund.none,
  });

  factory AdminCancelSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$AdminCancelSubscriptionDtoFromJson(json);

  final String reason;

  /// The name has been replaced because it contains a keyword. Original name: `when`.
  /// The name has been replaced because it contains a keyword. Original name: `when`.
  /// The name has been replaced because it contains a keyword. Original name: `when`.
  @JsonKey(name: 'when')
  final AdminSubscriptionCancelWhen whenValue;

  /// Only with when=now: refund the unused part of the period (prorated) or the whole last payment (full).
  final AdminSubscriptionCancelRefund refund;

  Map<String, Object?> toJson() => _$AdminCancelSubscriptionDtoToJson(this);
}
