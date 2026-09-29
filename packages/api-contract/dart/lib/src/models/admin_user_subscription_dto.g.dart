// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserSubscriptionDto _$AdminUserSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => AdminUserSubscriptionDto(
  status: json['status'] as String,
  trialEndsAt: json['trialEndsAt'] == null
      ? null
      : DateTime.parse(json['trialEndsAt'] as String),
  currentPeriodEnd: json['currentPeriodEnd'] == null
      ? null
      : DateTime.parse(json['currentPeriodEnd'] as String),
  cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
  graceEndsAt: json['graceEndsAt'] == null
      ? null
      : DateTime.parse(json['graceEndsAt'] as String),
);

Map<String, dynamic> _$AdminUserSubscriptionDtoToJson(
  AdminUserSubscriptionDto instance,
) => <String, dynamic>{
  'status': instance.status,
  'trialEndsAt': ?instance.trialEndsAt?.toIso8601String(),
  'currentPeriodEnd': ?instance.currentPeriodEnd?.toIso8601String(),
  'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
  'graceEndsAt': ?instance.graceEndsAt?.toIso8601String(),
};
