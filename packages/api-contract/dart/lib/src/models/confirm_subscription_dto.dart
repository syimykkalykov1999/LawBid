// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'confirm_subscription_dto.g.dart';

@JsonSerializable()
class ConfirmSubscriptionDto {
  const ConfirmSubscriptionDto({required this.setupIntentId, this.chargeNow});

  factory ConfirmSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$ConfirmSubscriptionDtoFromJson(json);

  final String setupIntentId;

  /// Required when the trial is unavailable (409 SUBSCRIPTION_TRIAL_UNAVAILABLE): the user confirmed "$399 will be charged now".
  final bool? chargeNow;

  Map<String, Object?> toJson() => _$ConfirmSubscriptionDtoToJson(this);
}
