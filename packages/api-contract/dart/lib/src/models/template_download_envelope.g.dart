// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'template_download_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TemplateDownloadEnvelope _$TemplateDownloadEnvelopeFromJson(
  Map<String, dynamic> json,
) => TemplateDownloadEnvelope(
  data: TemplateDownloadDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TemplateDownloadEnvelopeToJson(
  TemplateDownloadEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
