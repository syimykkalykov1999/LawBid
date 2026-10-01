// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskListEnvelope _$TaskListEnvelopeFromJson(Map<String, dynamic> json) =>
    TaskListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => TaskDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$TaskListEnvelopeToJson(TaskListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
