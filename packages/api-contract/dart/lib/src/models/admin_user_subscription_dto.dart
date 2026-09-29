// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_user_subscription_dto.g.dart';

@JsonSerializable()
class AdminUserSubscriptionDto {
  const AdminUserSubscriptionDto({
    required this.status,
    required this.trialEndsAt,
    required this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.graceEndsAt,
  });

  factory AdminUserSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserSubscriptionDtoFromJson(json);

  final String status;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final DateTime? graceEndsAt;

  Map<String, Object?> toJson() => _$AdminUserSubscriptionDtoToJson(this);
}
