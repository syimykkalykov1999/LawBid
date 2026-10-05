// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachTemplateDto _$OutreachTemplateDtoFromJson(Map<String, dynamic> json) =>
    OutreachTemplateDto(
      id: json['id'] as String,
      name: json['name'] as String,
      kind: OutreachTemplateKind.fromJson(json['kind'] as String),
      subject: json['subject'] as String,
      body: json['body'] as String,
      active: json['active'] as bool,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$OutreachTemplateDtoToJson(
  OutreachTemplateDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'kind': instance.kind.toJson(),
  'subject': instance.subject,
  'body': instance.body,
  'active': instance.active,
  'updatedAt': instance.updatedAt.toIso8601String(),
};
