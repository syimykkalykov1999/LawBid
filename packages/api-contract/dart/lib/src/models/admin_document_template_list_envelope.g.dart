// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_document_template_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDocumentTemplateListEnvelope _$AdminDocumentTemplateListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDocumentTemplateListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminDocumentTemplateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDocumentTemplateListEnvelopeToJson(
  AdminDocumentTemplateListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
