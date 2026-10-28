// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calls_path_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallsPathStepDto _$CallsPathStepDtoFromJson(Map<String, dynamic> json) =>
    CallsPathStepDto(
      ok: json['ok'] as bool,
      ms: (json['ms'] as num).toInt(),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$CallsPathStepDtoToJson(CallsPathStepDto instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'ms': instance.ms,
      'error': ?instance.error,
    };
