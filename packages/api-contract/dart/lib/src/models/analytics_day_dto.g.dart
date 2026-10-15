// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsDayDto _$AnalyticsDayDtoFromJson(Map<String, dynamic> json) =>
    AnalyticsDayDto(
      day: json['day'] as String,
      active: json['active'] as num,
      signups: json['signups'] as num,
      subscriptionCents: json['subscriptionCents'] as num,
      boostCents: json['boostCents'] as num,
      purchases: json['purchases'] as num,
    );

Map<String, dynamic> _$AnalyticsDayDtoToJson(AnalyticsDayDto instance) =>
    <String, dynamic>{
      'day': instance.day,
      'active': instance.active,
      'signups': instance.signups,
      'subscriptionCents': instance.subscriptionCents,
      'boostCents': instance.boostCents,
      'purchases': instance.purchases,
    };
