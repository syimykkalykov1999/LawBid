// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_document_admin_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDocumentAdminEnvelope _$LegalDocumentAdminEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalDocumentAdminEnvelope(
  data: LegalDocumentAdminDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalDocumentAdminEnvelopeToJson(
  LegalDocumentAdminEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
