// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudStatsDto _$FraudStatsDtoFromJson(Map<String, dynamic> json) =>
    FraudStatsDto(
      enabled: json['enabled'] as bool,
      auto: json['auto'] as bool,
      review: json['review'] as num,
      restricted: json['restricted'] as num,
      banned: json['banned'] as num,
      blockedSignIns30d: json['blockedSignIns30d'] as num,
      autoBanned30d: json['autoBanned30d'] as num,
    );

Map<String, dynamic> _$FraudStatsDtoToJson(FraudStatsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'auto': instance.auto,
      'review': instance.review,
      'restricted': instance.restricted,
      'banned': instance.banned,
      'blockedSignIns30d': instance.blockedSignIns30d,
      'autoBanned30d': instance.autoBanned30d,
    };
