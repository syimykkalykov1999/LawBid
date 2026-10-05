// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_template_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachTemplateInputDto _$OutreachTemplateInputDtoFromJson(
  Map<String, dynamic> json,
) => OutreachTemplateInputDto(
  name: json['name'] as String,
  subject: json['subject'] as String,
  body: json['body'] as String,
  kind: json['kind'] == null
      ? OutreachTemplateKind.any
      : OutreachTemplateKind.fromJson(json['kind'] as String),
  active: json['active'] as bool? ?? true,
);

Map<String, dynamic> _$OutreachTemplateInputDtoToJson(
  OutreachTemplateInputDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'kind': instance.kind.toJson(),
  'subject': instance.subject,
  'body': instance.body,
  'active': instance.active,
};
