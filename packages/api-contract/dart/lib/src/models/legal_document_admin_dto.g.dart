// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_document_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDocumentAdminDto _$LegalDocumentAdminDtoFromJson(
  Map<String, dynamic> json,
) => LegalDocumentAdminDto(
  id: json['id'] as String,
  docType: LegalDocumentAdminDtoDocType.fromJson(json['docType'] as String),
  locale: json['locale'] as String,
  version: json['version'] as String,
  isCurrent: json['isCurrent'] as bool,
  publishedAt: json['publishedAt'] == null
      ? null
      : DateTime.parse(json['publishedAt'] as String),
  contentUrl: json['contentUrl'] as String?,
  contentMd: json['contentMd'] as String?,
  consents: (json['consents'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$LegalDocumentAdminDtoToJson(
  LegalDocumentAdminDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'docType': instance.docType.toJson(),
  'locale': instance.locale,
  'version': instance.version,
  'isCurrent': instance.isCurrent,
  'publishedAt': ?instance.publishedAt?.toIso8601String(),
  'contentUrl': ?instance.contentUrl,
  'contentMd': ?instance.contentMd,
  'consents': instance.consents,
  'createdAt': instance.createdAt.toIso8601String(),
};
