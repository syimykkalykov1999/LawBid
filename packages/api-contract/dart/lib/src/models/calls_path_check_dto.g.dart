// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calls_path_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallsPathCheckDto _$CallsPathCheckDtoFromJson(Map<String, dynamic> json) =>
    CallsPathCheckDto(
      at: DateTime.parse(json['at'] as String),
      ok: json['ok'] as bool,
      ms: (json['ms'] as num).toInt(),
      stun: json['stun'] == null
          ? null
          : CallsPathStepDto.fromJson(json['stun'] as Map<String, dynamic>),
      turn: json['turn'] == null
          ? null
          : CallsPathStepDto.fromJson(json['turn'] as Map<String, dynamic>),
      media: json['media'] == null
          ? null
          : CallsPathStepDto.fromJson(json['media'] as Map<String, dynamic>),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$CallsPathCheckDtoToJson(CallsPathCheckDto instance) =>
    <String, dynamic>{
      'at': instance.at.toIso8601String(),
      'ok': instance.ok,
      'ms': instance.ms,
      'stun': ?instance.stun?.toJson(),
      'turn': ?instance.turn?.toJson(),
      'media': ?instance.media?.toJson(),
      'error': ?instance.error,
    };
