// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'import_synonyms_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ImportSynonymsResultEnvelope _$ImportSynonymsResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ImportSynonymsResultEnvelope(
  data: ImportSynonymsResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ImportSynonymsResultEnvelopeToJson(
  ImportSynonymsResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
