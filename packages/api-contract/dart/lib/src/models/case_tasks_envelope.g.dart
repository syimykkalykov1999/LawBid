// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_tasks_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseTasksEnvelope _$CaseTasksEnvelopeFromJson(Map<String, dynamic> json) =>
    CaseTasksEnvelope(
      data: CaseTasksDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CaseTasksEnvelopeToJson(CaseTasksEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
