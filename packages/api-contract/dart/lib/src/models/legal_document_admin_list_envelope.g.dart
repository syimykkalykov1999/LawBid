// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_document_admin_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDocumentAdminListEnvelope _$LegalDocumentAdminListEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalDocumentAdminListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => LegalDocumentAdminDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalDocumentAdminListEnvelopeToJson(
  LegalDocumentAdminListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
