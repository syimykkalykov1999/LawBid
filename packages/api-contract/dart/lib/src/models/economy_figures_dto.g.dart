// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'economy_figures_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EconomyFiguresDto _$EconomyFiguresDtoFromJson(Map<String, dynamic> json) =>
    EconomyFiguresDto(
      revenue30dUsd: json['revenue30dUsd'] as num,
      revenueMonthUsd: json['revenueMonthUsd'] as num,
      allowedUsd: json['allowedUsd'] as num,
      lines: (json['lines'] as List<dynamic>)
          .map((e) => SpendLineDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      monthToDateUsd: json['monthToDateUsd'] as num,
      projectedUsd: json['projectedUsd'] as num,
      thirdPartyMonthToDateUsd: json['thirdPartyMonthToDateUsd'] as num,
      thirdPartyProjectedUsd: json['thirdPartyProjectedUsd'] as num,
      awsMonthToDateUsd: json['awsMonthToDateUsd'] as num,
      awsProjectedUsd: json['awsProjectedUsd'] as num,
      awsLimitUsd: json['awsLimitUsd'] as num,
    );

Map<String, dynamic> _$EconomyFiguresDtoToJson(EconomyFiguresDto instance) =>
    <String, dynamic>{
      'revenue30dUsd': instance.revenue30dUsd,
      'revenueMonthUsd': instance.revenueMonthUsd,
      'allowedUsd': instance.allowedUsd,
      'lines': instance.lines.map((e) => e.toJson()).toList(),
      'monthToDateUsd': instance.monthToDateUsd,
      'projectedUsd': instance.projectedUsd,
      'thirdPartyMonthToDateUsd': instance.thirdPartyMonthToDateUsd,
      'thirdPartyProjectedUsd': instance.thirdPartyProjectedUsd,
      'awsMonthToDateUsd': instance.awsMonthToDateUsd,
      'awsProjectedUsd': instance.awsProjectedUsd,
      'awsLimitUsd': instance.awsLimitUsd,
    };
