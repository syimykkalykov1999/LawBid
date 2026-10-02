// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_badge_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientBadgeSubscriptionDto _$ClientBadgeSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => ClientBadgeSubscriptionDto(
  status: ClientBadgeSubscriptionDtoStatus.fromJson(json['status'] as String),
  cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
  currentPeriodEnd: json['currentPeriodEnd'] as String?,
);

Map<String, dynamic> _$ClientBadgeSubscriptionDtoToJson(
  ClientBadgeSubscriptionDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'currentPeriodEnd': ?instance.currentPeriodEnd,
  'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
};
