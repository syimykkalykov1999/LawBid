// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'confirm_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfirmSubscriptionDto _$ConfirmSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => ConfirmSubscriptionDto(
  setupIntentId: json['setupIntentId'] as String,
  chargeNow: json['chargeNow'] as bool?,
);

Map<String, dynamic> _$ConfirmSubscriptionDtoToJson(
  ConfirmSubscriptionDto instance,
) => <String, dynamic>{
  'setupIntentId': instance.setupIntentId,
  'chargeNow': ?instance.chargeNow,
};
