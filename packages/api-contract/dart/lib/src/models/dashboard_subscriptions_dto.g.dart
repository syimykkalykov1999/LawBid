// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_subscriptions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardSubscriptionsDto _$DashboardSubscriptionsDtoFromJson(
  Map<String, dynamic> json,
) => DashboardSubscriptionsDto(
  trialing: (json['trialing'] as num).toInt(),
  active: (json['active'] as num).toInt(),
  pastDue: (json['pastDue'] as num).toInt(),
  live: (json['live'] as num).toInt(),
  revenueEstimateCents: (json['revenueEstimateCents'] as num).toInt(),
  revenueEstimateUsd: (json['revenueEstimateUsd'] as num).toInt(),
);

Map<String, dynamic> _$DashboardSubscriptionsDtoToJson(
  DashboardSubscriptionsDto instance,
) => <String, dynamic>{
  'trialing': instance.trialing,
  'active': instance.active,
  'pastDue': instance.pastDue,
  'live': instance.live,
  'revenueEstimateCents': instance.revenueEstimateCents,
  'revenueEstimateUsd': instance.revenueEstimateUsd,
};
