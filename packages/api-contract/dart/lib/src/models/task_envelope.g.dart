// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskEnvelope _$TaskEnvelopeFromJson(Map<String, dynamic> json) => TaskEnvelope(
  data: TaskDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TaskEnvelopeToJson(TaskEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
