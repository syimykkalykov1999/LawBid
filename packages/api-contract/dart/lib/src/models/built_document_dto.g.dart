// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'built_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BuiltDocumentDto _$BuiltDocumentDtoFromJson(Map<String, dynamic> json) =>
    BuiltDocumentDto(
      fileId: json['fileId'] as String,
      title: json['title'] as String,
      url: json['url'] as String?,
    );

Map<String, dynamic> _$BuiltDocumentDtoToJson(BuiltDocumentDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'title': instance.title,
      'url': ?instance.url,
    };
