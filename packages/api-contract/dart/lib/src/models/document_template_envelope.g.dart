// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'document_template_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DocumentTemplateEnvelope _$DocumentTemplateEnvelopeFromJson(
  Map<String, dynamic> json,
) => DocumentTemplateEnvelope(
  data: DocumentTemplateDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DocumentTemplateEnvelopeToJson(
  DocumentTemplateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
