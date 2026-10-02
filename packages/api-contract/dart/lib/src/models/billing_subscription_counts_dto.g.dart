// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billing_subscription_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillingSubscriptionCountsDto _$BillingSubscriptionCountsDtoFromJson(
  Map<String, dynamic> json,
) => BillingSubscriptionCountsDto(
  active: (json['active'] as num).toInt(),
  trialing: (json['trialing'] as num).toInt(),
  pastDue: (json['pastDue'] as num).toInt(),
  monthly: (json['monthly'] as num).toInt(),
  yearly: (json['yearly'] as num).toInt(),
);

Map<String, dynamic> _$BillingSubscriptionCountsDtoToJson(
  BillingSubscriptionCountsDto instance,
) => <String, dynamic>{
  'active': instance.active,
  'trialing': instance.trialing,
  'pastDue': instance.pastDue,
  'monthly': instance.monthly,
  'yearly': instance.yearly,
};
