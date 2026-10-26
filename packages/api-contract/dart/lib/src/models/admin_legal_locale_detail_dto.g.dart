// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_locale_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalLocaleDetailDto _$AdminLegalLocaleDetailDtoFromJson(
  Map<String, dynamic> json,
) => AdminLegalLocaleDetailDto(
  locale: AdminLegalLocaleDetailDtoLocale.fromJson(json['locale'] as String),
  current: json['current'] == null
      ? null
      : AdminLegalVersionDto.fromJson(json['current'] as Map<String, dynamic>),
  draft: json['draft'] == null
      ? null
      : AdminLegalVersionDto.fromJson(json['draft'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLegalLocaleDetailDtoToJson(
  AdminLegalLocaleDetailDto instance,
) => <String, dynamic>{
  'locale': instance.locale.toJson(),
  'current': ?instance.current?.toJson(),
  'draft': ?instance.draft?.toJson(),
};
