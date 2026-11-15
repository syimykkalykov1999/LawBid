// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'autoscale_knob_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoscaleKnobDto _$AutoscaleKnobDtoFromJson(Map<String, dynamic> json) =>
    AutoscaleKnobDto(
      key: json['key'] as String,
      ru: json['ru'] as String,
      min: json['min'] as num,
      max: json['max'] as num,
      kind: AutoscaleKnobDtoKind.fromJson(json['kind'] as String),
      value: json['value'] as num?,
    );

Map<String, dynamic> _$AutoscaleKnobDtoToJson(AutoscaleKnobDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'ru': instance.ru,
      'min': instance.min,
      'max': instance.max,
      'kind': instance.kind.toJson(),
      'value': ?instance.value,
    };
