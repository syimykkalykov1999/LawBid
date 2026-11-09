// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_auto_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchAutoStepDto _$SearchAutoStepDtoFromJson(Map<String, dynamic> json) =>
    SearchAutoStepDto(
      at: json['at'] as String,
      step: json['step'] as String,
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$SearchAutoStepDtoToJson(SearchAutoStepDto instance) =>
    <String, dynamic>{
      'at': instance.at,
      'step': instance.step,
      'reason': instance.reason,
    };
