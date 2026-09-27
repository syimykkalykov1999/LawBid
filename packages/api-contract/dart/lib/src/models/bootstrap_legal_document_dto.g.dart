// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bootstrap_legal_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BootstrapLegalDocumentDto _$BootstrapLegalDocumentDtoFromJson(
  Map<String, dynamic> json,
) => BootstrapLegalDocumentDto(
  id: json['id'] as String,
  docType: LegalDocType.fromJson(json['doc_type'] as String),
  version: json['version'] as String,
  locale: json['locale'] as String,
  contentUrl: json['content_url'] as String?,
  contentMd: json['content_md'] as String?,
  publishedAt: json['published_at'] == null
      ? null
      : DateTime.parse(json['published_at'] as String),
);

Map<String, dynamic> _$BootstrapLegalDocumentDtoToJson(
  BootstrapLegalDocumentDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'doc_type': instance.docType.toJson(),
  'version': instance.version,
  'locale': instance.locale,
  'content_url': ?instance.contentUrl,
  'content_md': ?instance.contentMd,
  'published_at': ?instance.publishedAt?.toIso8601String(),
};
