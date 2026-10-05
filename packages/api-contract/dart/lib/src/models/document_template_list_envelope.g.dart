// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'document_template_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DocumentTemplateListEnvelope _$DocumentTemplateListEnvelopeFromJson(
  Map<String, dynamic> json,
) => DocumentTemplateListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => DocumentTemplateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DocumentTemplateListEnvelopeToJson(
  DocumentTemplateListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
