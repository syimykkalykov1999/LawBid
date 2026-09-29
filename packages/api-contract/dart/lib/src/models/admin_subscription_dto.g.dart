// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSubscriptionDto _$AdminSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => AdminSubscriptionDto(
  userId: json['userId'] as String,
  subscription: json['subscription'] == null
      ? null
      : SubscriptionDto.fromJson(json['subscription'] as Map<String, dynamic>),
  stripeSubscriptionId: json['stripeSubscriptionId'] as String?,
  stripeCustomerId: json['stripeCustomerId'] as String?,
  dashboardUrl: json['dashboardUrl'] as String?,
  payments: (json['payments'] as List<dynamic>)
      .map((e) => PaymentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  trialsUsedWithCard: (json['trialsUsedWithCard'] as num).toInt(),
);

Map<String, dynamic> _$AdminSubscriptionDtoToJson(
  AdminSubscriptionDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'subscription': ?instance.subscription?.toJson(),
  'stripeSubscriptionId': ?instance.stripeSubscriptionId,
  'stripeCustomerId': ?instance.stripeCustomerId,
  'dashboardUrl': ?instance.dashboardUrl,
  'payments': instance.payments.map((e) => e.toJson()).toList(),
  'trialsUsedWithCard': instance.trialsUsedWithCard,
};
