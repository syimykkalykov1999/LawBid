// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_subscription_dto_status.dart';

part 'client_subscription_dto.g.dart';

@JsonSerializable()
class ClientSubscriptionDto {
  const ClientSubscriptionDto({
    required this.id,
    required this.status,
    required this.isActive,
    required this.planCode,
    required this.priceCents,
    required this.trialEndsAt,
    required this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.canceledAt,
  });

  factory ClientSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$ClientSubscriptionDtoFromJson(json);

  final String id;
  final ClientSubscriptionDtoStatus status;
  final bool isActive;
  final String? planCode;
  final int priceCents;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final DateTime? canceledAt;

  Map<String, Object?> toJson() => _$ClientSubscriptionDtoToJson(this);
}
