// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'build_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BuildDocumentDto _$BuildDocumentDtoFromJson(Map<String, dynamic> json) =>
    BuildDocumentDto(
      templateId: json['templateId'] as String,
      language: json['language'] as String,
      values: Map<String, String>.from(json['values'] as Map),
    );

Map<String, dynamic> _$BuildDocumentDtoToJson(BuildDocumentDto instance) =>
    <String, dynamic>{
      'templateId': instance.templateId,
      'language': instance.language,
      'values': instance.values,
    };
