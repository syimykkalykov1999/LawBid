// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_badge_subscription_dto_status.dart';

part 'client_badge_subscription_dto.g.dart';

@JsonSerializable()
class ClientBadgeSubscriptionDto {
  const ClientBadgeSubscriptionDto({
    required this.status,
    required this.cancelAtPeriodEnd,
    this.currentPeriodEnd,
  });

  factory ClientBadgeSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$ClientBadgeSubscriptionDtoFromJson(json);

  final ClientBadgeSubscriptionDtoStatus status;
  final String? currentPeriodEnd;
  final bool cancelAtPeriodEnd;

  Map<String, Object?> toJson() => _$ClientBadgeSubscriptionDtoToJson(this);
}
