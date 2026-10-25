// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'budget_limit_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BudgetLimitRequestDto _$BudgetLimitRequestDtoFromJson(
  Map<String, dynamic> json,
) => BudgetLimitRequestDto(
  name: json['name'] as String,
  limitUsd: json['limitUsd'] as num,
);

Map<String, dynamic> _$BudgetLimitRequestDtoToJson(
  BudgetLimitRequestDto instance,
) => <String, dynamic>{'name': instance.name, 'limitUsd': instance.limitUsd};
