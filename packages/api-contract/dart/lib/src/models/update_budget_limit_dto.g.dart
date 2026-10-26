// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_budget_limit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateBudgetLimitDto _$UpdateBudgetLimitDtoFromJson(
  Map<String, dynamic> json,
) => UpdateBudgetLimitDto(
  mode: UpdateBudgetLimitDtoMode.fromJson(json['mode'] as String),
  floor: (json['floor'] as num?)?.toInt(),
  ceiling: (json['ceiling'] as num?)?.toInt(),
  value: (json['value'] as num?)?.toInt(),
);

Map<String, dynamic> _$UpdateBudgetLimitDtoToJson(
  UpdateBudgetLimitDto instance,
) => <String, dynamic>{
  'mode': instance.mode.toJson(),
  'floor': ?instance.floor,
  'ceiling': ?instance.ceiling,
  'value': ?instance.value,
};
