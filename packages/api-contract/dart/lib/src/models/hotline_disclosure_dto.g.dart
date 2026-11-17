// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_disclosure_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineDisclosureDto _$HotlineDisclosureDtoFromJson(
  Map<String, dynamic> json,
) => HotlineDisclosureDto(
  version: json['version'] as num,
  key: json['key'] as String?,
  kind: json['kind'] == null
      ? null
      : HotlineDisclosureKind.fromJson(json['kind'] as String),
  ru: json['ru'] as String?,
  en: json['en'] as String?,
);

Map<String, dynamic> _$HotlineDisclosureDtoToJson(
  HotlineDisclosureDto instance,
) => <String, dynamic>{
  'key': ?instance.key,
  'kind': ?instance.kind?.toJson(),
  'version': instance.version,
  'ru': ?instance.ru,
  'en': ?instance.en,
};
