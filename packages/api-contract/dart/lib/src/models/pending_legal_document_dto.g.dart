// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pending_legal_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PendingLegalDocumentDto _$PendingLegalDocumentDtoFromJson(
  Map<String, dynamic> json,
) => PendingLegalDocumentDto(
  id: json['id'] as String,
  docType: PendingLegalDocumentDtoDocType.fromJson(json['docType'] as String),
  locale: PendingLegalDocumentDtoLocale.fromJson(json['locale'] as String),
  version: json['version'] as String,
  title: json['title'] as String,
  publishedAt: json['publishedAt'] == null
      ? null
      : DateTime.parse(json['publishedAt'] as String),
  reason: PendingLegalDocumentDtoReason.fromJson(json['reason'] as String),
);

Map<String, dynamic> _$PendingLegalDocumentDtoToJson(
  PendingLegalDocumentDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'docType': instance.docType.toJson(),
  'locale': instance.locale.toJson(),
  'version': instance.version,
  'title': instance.title,
  'publishedAt': ?instance.publishedAt?.toIso8601String(),
  'reason': instance.reason.toJson(),
};
