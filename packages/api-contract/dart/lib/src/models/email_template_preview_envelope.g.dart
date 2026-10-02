// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplatePreviewEnvelope _$EmailTemplatePreviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => EmailTemplatePreviewEnvelope(
  data: EmailTemplatePreviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$EmailTemplatePreviewEnvelopeToJson(
  EmailTemplatePreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
