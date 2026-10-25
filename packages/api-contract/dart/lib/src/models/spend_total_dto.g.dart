// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'spend_total_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SpendTotalDto _$SpendTotalDtoFromJson(Map<String, dynamic> json) =>
    SpendTotalDto(
      monthToDateUsd: json['monthToDateUsd'] as num,
      forecastUsd: json['forecastUsd'] as num,
      marginPercent: json['marginPercent'] as num,
      keepOnAccountUsd: json['keepOnAccountUsd'] as num,
      fixedMonthUsd: json['fixedMonthUsd'] as num,
      stripeFeesUsd: json['stripeFeesUsd'] as num?,
    );

Map<String, dynamic> _$SpendTotalDtoToJson(SpendTotalDto instance) =>
    <String, dynamic>{
      'monthToDateUsd': instance.monthToDateUsd,
      'forecastUsd': instance.forecastUsd,
      'marginPercent': instance.marginPercent,
      'keepOnAccountUsd': instance.keepOnAccountUsd,
      'fixedMonthUsd': instance.fixedMonthUsd,
      'stripeFeesUsd': ?instance.stripeFeesUsd,
    };
