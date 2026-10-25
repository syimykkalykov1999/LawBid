// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'aws_budget_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AwsBudgetDto _$AwsBudgetDtoFromJson(Map<String, dynamic> json) => AwsBudgetDto(
  name: json['name'] as String,
  limitUsd: json['limitUsd'] as num?,
  actualUsd: json['actualUsd'] as num?,
  forecastUsd: json['forecastUsd'] as num?,
  timeUnit: json['timeUnit'] as String?,
  prod: json['prod'] as bool,
  obsolete: json['obsolete'] as bool,
);

Map<String, dynamic> _$AwsBudgetDtoToJson(AwsBudgetDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'limitUsd': ?instance.limitUsd,
      'actualUsd': ?instance.actualUsd,
      'forecastUsd': ?instance.forecastUsd,
      'timeUnit': ?instance.timeUnit,
      'prod': instance.prod,
      'obsolete': instance.obsolete,
    };
