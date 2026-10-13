// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_workspace_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseWorkspaceEnvelope _$CaseWorkspaceEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseWorkspaceEnvelope(
  data: CaseWorkspaceDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseWorkspaceEnvelopeToJson(
  CaseWorkspaceEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
