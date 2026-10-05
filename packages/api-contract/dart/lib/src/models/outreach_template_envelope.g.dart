// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_template_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachTemplateEnvelope _$OutreachTemplateEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachTemplateEnvelope(
  data: OutreachTemplateDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachTemplateEnvelopeToJson(
  OutreachTemplateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
