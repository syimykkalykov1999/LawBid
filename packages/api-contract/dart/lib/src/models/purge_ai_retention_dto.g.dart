// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'purge_ai_retention_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PurgeAiRetentionDto _$PurgeAiRetentionDtoFromJson(Map<String, dynamic> json) =>
    PurgeAiRetentionDto(
      mode: AiPurgeMode.fromJson(json['mode'] as String),
      scope: AiPurgeScope.fromJson(json['scope'] as String),
    );

Map<String, dynamic> _$PurgeAiRetentionDtoToJson(
  PurgeAiRetentionDto instance,
) => <String, dynamic>{
  'mode': instance.mode.toJson(),
  'scope': instance.scope.toJson(),
};
