// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_template_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachTemplateListEnvelope _$OutreachTemplateListEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachTemplateListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => OutreachTemplateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachTemplateListEnvelopeToJson(
  OutreachTemplateListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
