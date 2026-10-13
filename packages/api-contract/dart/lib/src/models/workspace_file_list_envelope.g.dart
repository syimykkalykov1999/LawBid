// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_file_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceFileListEnvelope _$WorkspaceFileListEnvelopeFromJson(
  Map<String, dynamic> json,
) => WorkspaceFileListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => WorkspaceFileDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$WorkspaceFileListEnvelopeToJson(
  WorkspaceFileListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
