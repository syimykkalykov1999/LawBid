// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_download_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDownloadEnvelope _$LegalDownloadEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalDownloadEnvelope(
  data: LegalDownloadDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalDownloadEnvelopeToJson(
  LegalDownloadEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
