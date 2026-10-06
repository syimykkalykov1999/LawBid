// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pending_legal_document_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PendingLegalDocumentListEnvelope _$PendingLegalDocumentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PendingLegalDocumentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PendingLegalDocumentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PendingLegalDocumentListEnvelopeToJson(
  PendingLegalDocumentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
