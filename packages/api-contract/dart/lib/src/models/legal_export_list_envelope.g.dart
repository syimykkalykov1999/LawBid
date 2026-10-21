// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_export_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalExportListEnvelope _$LegalExportListEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalExportListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => LegalExportDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalExportListEnvelopeToJson(
  LegalExportListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
