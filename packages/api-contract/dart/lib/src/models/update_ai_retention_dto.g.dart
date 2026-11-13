// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_ai_retention_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateAiRetentionDto _$UpdateAiRetentionDtoFromJson(
  Map<String, dynamic> json,
) => UpdateAiRetentionDto(
  days: json['days'] as num,
  what: AiRetentionWhat.fromJson(json['what'] as String),
);

Map<String, dynamic> _$UpdateAiRetentionDtoToJson(
  UpdateAiRetentionDto instance,
) => <String, dynamic>{'days': instance.days, 'what': instance.what.toJson()};
