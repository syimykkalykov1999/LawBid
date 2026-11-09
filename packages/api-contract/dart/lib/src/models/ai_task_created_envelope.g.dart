// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_task_created_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiTaskCreatedEnvelope _$AiTaskCreatedEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiTaskCreatedEnvelope(
  data: AiTaskCreatedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiTaskCreatedEnvelopeToJson(
  AiTaskCreatedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
