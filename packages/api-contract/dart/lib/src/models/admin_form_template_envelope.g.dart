// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_form_template_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminFormTemplateEnvelope _$AdminFormTemplateEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminFormTemplateEnvelope(
  data: AdminFormTemplateDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminFormTemplateEnvelopeToJson(
  AdminFormTemplateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
