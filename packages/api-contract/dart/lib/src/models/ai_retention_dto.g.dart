// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_retention_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiRetentionDto _$AiRetentionDtoFromJson(Map<String, dynamic> json) =>
    AiRetentionDto(
      recordsDays: json['recordsDays'] as num,
      imagesDays: json['imagesDays'] as num,
    );

Map<String, dynamic> _$AiRetentionDtoToJson(AiRetentionDto instance) =>
    <String, dynamic>{
      'recordsDays': instance.recordsDays,
      'imagesDays': instance.imagesDays,
    };
