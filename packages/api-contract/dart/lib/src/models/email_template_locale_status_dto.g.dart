// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_locale_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateLocaleStatusDto _$EmailTemplateLocaleStatusDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplateLocaleStatusDto(
  locale: EmailTemplateLocaleStatusDtoLocale.fromJson(json['locale'] as String),
  overridden: json['overridden'] as bool,
  active: json['active'] as bool,
  updatedAt: json['updatedAt'] == null
      ? null
      : DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$EmailTemplateLocaleStatusDtoToJson(
  EmailTemplateLocaleStatusDto instance,
) => <String, dynamic>{
  'locale': instance.locale.toJson(),
  'overridden': instance.overridden,
  'active': instance.active,
  'updatedAt': ?instance.updatedAt?.toIso8601String(),
};
