// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scale_mode_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScaleModeDto _$ScaleModeDtoFromJson(Map<String, dynamic> json) => ScaleModeDto(
  mode: ScaleModeDtoMode.fromJson(json['mode'] as String),
  by: ScaleModeDtoBy.fromJson(json['by'] as String),
  at: json['at'] as String,
);

Map<String, dynamic> _$ScaleModeDtoToJson(ScaleModeDto instance) =>
    <String, dynamic>{
      'mode': instance.mode.toJson(),
      'by': instance.by.toJson(),
      'at': instance.at,
    };
