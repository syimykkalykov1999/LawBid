// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceEnvelope _$WorkspaceEnvelopeFromJson(Map<String, dynamic> json) =>
    WorkspaceEnvelope(
      data: WorkspaceDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$WorkspaceEnvelopeToJson(WorkspaceEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
