// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_test_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateTestResultEnvelope _$EmailTemplateTestResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => EmailTemplateTestResultEnvelope(
  data: EmailTemplateTestResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$EmailTemplateTestResultEnvelopeToJson(
  EmailTemplateTestResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
