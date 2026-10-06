// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_document_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalDocumentDetailEnvelope _$AdminLegalDocumentDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminLegalDocumentDetailEnvelope(
  data: AdminLegalDocumentDetailDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLegalDocumentDetailEnvelopeToJson(
  AdminLegalDocumentDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
