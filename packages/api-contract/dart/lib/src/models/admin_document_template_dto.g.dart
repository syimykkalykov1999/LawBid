// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_document_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDocumentTemplateDto _$AdminDocumentTemplateDtoFromJson(
  Map<String, dynamic> json,
) => AdminDocumentTemplateDto(
  id: json['id'] as String,
  title: json['title'] as String,
  description: json['description'] as String,
  fileName: json['fileName'] as String,
  mime: json['mime'] as String,
  sizeBytes: json['sizeBytes'] as num,
  practiceAreaId: json['practiceAreaId'] as String?,
  practiceAreaKey: json['practiceAreaKey'] as String?,
  practiceAreaName: json['practiceAreaName'] as String?,
  state: json['state'] as String?,
  language: json['language'] as String,
  audience: TemplateAudience.fromJson(json['audience'] as String),
  downloadCount: json['downloadCount'] as num,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  locked: json['locked'] as bool,
  fileId: json['fileId'] as String,
  published: json['published'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminDocumentTemplateDtoToJson(
  AdminDocumentTemplateDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'description': instance.description,
  'fileName': instance.fileName,
  'mime': instance.mime,
  'sizeBytes': instance.sizeBytes,
  'practiceAreaId': ?instance.practiceAreaId,
  'practiceAreaKey': ?instance.practiceAreaKey,
  'practiceAreaName': ?instance.practiceAreaName,
  'state': ?instance.state,
  'language': instance.language,
  'audience': instance.audience.toJson(),
  'downloadCount': instance.downloadCount,
  'updatedAt': instance.updatedAt.toIso8601String(),
  'locked': instance.locked,
  'fileId': instance.fileId,
  'published': instance.published,
  'createdAt': instance.createdAt.toIso8601String(),
};
