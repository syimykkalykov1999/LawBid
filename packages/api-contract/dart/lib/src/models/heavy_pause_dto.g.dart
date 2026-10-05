// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'heavy_pause_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HeavyPauseDto _$HeavyPauseDtoFromJson(Map<String, dynamic> json) =>
    HeavyPauseDto(
      by: HeavyPauseDtoBy.fromJson(json['by'] as String),
      at: json['at'] as String,
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$HeavyPauseDtoToJson(HeavyPauseDto instance) =>
    <String, dynamic>{
      'by': instance.by.toJson(),
      'at': instance.at,
      'reason': instance.reason,
    };
