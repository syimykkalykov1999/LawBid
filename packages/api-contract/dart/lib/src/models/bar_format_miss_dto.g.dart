// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bar_format_miss_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BarFormatMissDto _$BarFormatMissDtoFromJson(Map<String, dynamic> json) =>
    BarFormatMissDto(
      stateCode: json['stateCode'] as String,
      shape: json['shape'] as String,
      hits: json['hits'] as num,
      lastSeen: DateTime.parse(json['lastSeen'] as String),
    );

Map<String, dynamic> _$BarFormatMissDtoToJson(BarFormatMissDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'shape': instance.shape,
      'hits': instance.hits,
      'lastSeen': instance.lastSeen.toIso8601String(),
    };
