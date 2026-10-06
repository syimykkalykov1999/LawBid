// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_document_public_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDocumentPublicDto _$LegalDocumentPublicDtoFromJson(
  Map<String, dynamic> json,
) => LegalDocumentPublicDto(
  id: json['id'] as String,
  docType: LegalDocumentPublicDtoDocType.fromJson(json['docType'] as String),
  locale: LegalDocumentPublicDtoLocale.fromJson(json['locale'] as String),
  version: json['version'] as String,
  title: json['title'] as String,
  publishedAt: json['publishedAt'] == null
      ? null
      : DateTime.parse(json['publishedAt'] as String),
  contentMd: json['contentMd'] as String,
  requiresReacceptance: json['requiresReacceptance'] as bool,
);

Map<String, dynamic> _$LegalDocumentPublicDtoToJson(
  LegalDocumentPublicDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'docType': instance.docType.toJson(),
  'locale': instance.locale.toJson(),
  'version': instance.version,
  'title': instance.title,
  'publishedAt': ?instance.publishedAt?.toIso8601String(),
  'contentMd': instance.contentMd,
  'requiresReacceptance': instance.requiresReacceptance,
};
