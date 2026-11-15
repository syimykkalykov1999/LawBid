// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'autoscale_tuning_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoscaleTuningTargetDto _$AutoscaleTuningTargetDtoFromJson(
  Map<String, dynamic> json,
) => AutoscaleTuningTargetDto(
  target: AutoscaleTuningTargetDtoTarget.fromJson(json['target'] as String),
  available: json['available'] as bool,
  knobs: (json['knobs'] as List<dynamic>)
      .map((e) => AutoscaleKnobDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AutoscaleTuningTargetDtoToJson(
  AutoscaleTuningTargetDto instance,
) => <String, dynamic>{
  'target': instance.target.toJson(),
  'available': instance.available,
  'knobs': instance.knobs.map((e) => e.toJson()).toList(),
};
