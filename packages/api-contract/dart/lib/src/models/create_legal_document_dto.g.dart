// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_legal_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateLegalDocumentDto _$CreateLegalDocumentDtoFromJson(
  Map<String, dynamic> json,
) => CreateLegalDocumentDto(
  docType: CreateLegalDocumentDtoDocType.fromJson(json['docType'] as String),
  locale: json['locale'] as String,
  version: json['version'] as String,
  contentMd: json['contentMd'] as String?,
  contentUrl: json['contentUrl'] as String?,
);

Map<String, dynamic> _$CreateLegalDocumentDtoToJson(
  CreateLegalDocumentDto instance,
) => <String, dynamic>{
  'docType': instance.docType.toJson(),
  'locale': instance.locale,
  'version': instance.version,
  'contentMd': ?instance.contentMd,
  'contentUrl': ?instance.contentUrl,
};
