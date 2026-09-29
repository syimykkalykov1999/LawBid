// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'extend_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExtendSubscriptionDto _$ExtendSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => ExtendSubscriptionDto(
  days: (json['days'] as num).toInt(),
  reason: json['reason'] as String,
);

Map<String, dynamic> _$ExtendSubscriptionDtoToJson(
  ExtendSubscriptionDto instance,
) => <String, dynamic>{'days': instance.days, 'reason': instance.reason};
