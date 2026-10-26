// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateDetailDto _$EmailTemplateDetailDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplateDetailDto(
  key: EmailTemplateDetailDtoKey.fromJson(json['key'] as String),
  locale: EmailTemplateDetailDtoLocale.fromJson(json['locale'] as String),
  title: json['title'] as String,
  description: json['description'] as String,
  variables: (json['variables'] as List<dynamic>)
      .map((e) => EmailTemplateVariableDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  defaultRendered: RenderedEmailDto.fromJson(
    json['defaultRendered'] as Map<String, dynamic>,
  ),
  override: json['override'] == null
      ? null
      : EmailTemplateOverrideDto.fromJson(
          json['override'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$EmailTemplateDetailDtoToJson(
  EmailTemplateDetailDto instance,
) => <String, dynamic>{
  'key': instance.key.toJson(),
  'locale': instance.locale.toJson(),
  'title': instance.title,
  'description': instance.description,
  'variables': instance.variables.map((e) => e.toJson()).toList(),
  'defaultRendered': instance.defaultRendered.toJson(),
  'override': ?instance.override?.toJson(),
};
