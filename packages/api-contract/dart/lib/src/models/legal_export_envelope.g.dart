// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_export_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalExportEnvelope _$LegalExportEnvelopeFromJson(Map<String, dynamic> json) =>
    LegalExportEnvelope(
      data: LegalExportDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LegalExportEnvelopeToJson(
  LegalExportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
