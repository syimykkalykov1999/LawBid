// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_document_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalDocumentRowListEnvelope _$AdminLegalDocumentRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminLegalDocumentRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminLegalDocumentRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLegalDocumentRowListEnvelopeToJson(
  AdminLegalDocumentRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
