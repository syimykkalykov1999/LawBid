// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_document_brief_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDocumentBriefDto _$LegalDocumentBriefDtoFromJson(
  Map<String, dynamic> json,
) => LegalDocumentBriefDto(
  id: json['id'] as String,
  docType: LegalDocumentBriefDtoDocType.fromJson(json['docType'] as String),
  locale: LegalDocumentBriefDtoLocale.fromJson(json['locale'] as String),
  version: json['version'] as String,
  title: json['title'] as String,
  publishedAt: json['publishedAt'] == null
      ? null
      : DateTime.parse(json['publishedAt'] as String),
);

Map<String, dynamic> _$LegalDocumentBriefDtoToJson(
  LegalDocumentBriefDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'docType': instance.docType.toJson(),
  'locale': instance.locale.toJson(),
  'version': instance.version,
  'title': instance.title,
  'publishedAt': ?instance.publishedAt?.toIso8601String(),
};
