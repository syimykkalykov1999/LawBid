// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'copy_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CopyTemplateDto _$CopyTemplateDtoFromJson(Map<String, dynamic> json) =>
    CopyTemplateDto(
      target: TemplateCopyTarget.fromJson(json['target'] as String),
    );

Map<String, dynamic> _$CopyTemplateDtoToJson(CopyTemplateDto instance) =>
    <String, dynamic>{'target': instance.target.toJson()};
