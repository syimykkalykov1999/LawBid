// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'document_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DocumentRequestDto _$DocumentRequestDtoFromJson(Map<String, dynamic> json) =>
    DocumentRequestDto(
      template: DocumentRequestDtoTemplate.fromJson(json['template'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$DocumentRequestDtoToJson(DocumentRequestDto instance) =>
    <String, dynamic>{
      'template': instance.template.toJson(),
      'note': ?instance.note,
    };
