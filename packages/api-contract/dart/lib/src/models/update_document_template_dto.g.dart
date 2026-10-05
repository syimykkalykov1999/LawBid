// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_document_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateDocumentTemplateDto _$UpdateDocumentTemplateDtoFromJson(
  Map<String, dynamic> json,
) => UpdateDocumentTemplateDto(
  description: json['description'] as String?,
  fileName: json['fileName'] as String?,
  practiceAreaId: json['practiceAreaId'] as String?,
  state: json['state'] as String?,
  language: json['language'] as String?,
  audience: json['audience'] == null
      ? null
      : TemplateAudience.fromJson(json['audience'] as String),
  published: json['published'] as bool?,
  fileId: json['fileId'] as String?,
  title: json['title'] as String?,
);

Map<String, dynamic> _$UpdateDocumentTemplateDtoToJson(
  UpdateDocumentTemplateDto instance,
) => <String, dynamic>{
  'description': ?instance.description,
  'fileName': ?instance.fileName,
  'practiceAreaId': ?instance.practiceAreaId,
  'state': ?instance.state,
  'language': ?instance.language,
  'audience': ?instance.audience?.toJson(),
  'published': ?instance.published,
  'fileId': ?instance.fileId,
  'title': ?instance.title,
};
