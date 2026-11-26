// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_commit_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsCommitRowListEnvelope _$MlsCommitRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => MlsCommitRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => MlsCommitRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MlsCommitRowListEnvelopeToJson(
  MlsCommitRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
