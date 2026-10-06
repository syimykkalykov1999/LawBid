// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_document_brief_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDocumentBriefListEnvelope _$LegalDocumentBriefListEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalDocumentBriefListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => LegalDocumentBriefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalDocumentBriefListEnvelopeToJson(
  LegalDocumentBriefListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
