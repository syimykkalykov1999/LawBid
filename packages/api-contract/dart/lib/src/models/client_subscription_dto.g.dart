// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientSubscriptionDto _$ClientSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => ClientSubscriptionDto(
  id: json['id'] as String,
  status: ClientSubscriptionDtoStatus.fromJson(json['status'] as String),
  isActive: json['isActive'] as bool,
  planCode: json['planCode'] as String?,
  priceCents: (json['priceCents'] as num).toInt(),
  trialEndsAt: json['trialEndsAt'] == null
      ? null
      : DateTime.parse(json['trialEndsAt'] as String),
  currentPeriodEnd: json['currentPeriodEnd'] == null
      ? null
      : DateTime.parse(json['currentPeriodEnd'] as String),
  cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
  canceledAt: json['canceledAt'] == null
      ? null
      : DateTime.parse(json['canceledAt'] as String),
);

Map<String, dynamic> _$ClientSubscriptionDtoToJson(
  ClientSubscriptionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'isActive': instance.isActive,
  'planCode': ?instance.planCode,
  'priceCents': instance.priceCents,
  'trialEndsAt': ?instance.trialEndsAt?.toIso8601String(),
  'currentPeriodEnd': ?instance.currentPeriodEnd?.toIso8601String(),
  'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
  'canceledAt': ?instance.canceledAt?.toIso8601String(),
};
