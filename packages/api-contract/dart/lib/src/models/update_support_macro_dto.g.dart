// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_support_macro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateSupportMacroDto _$UpdateSupportMacroDtoFromJson(
  Map<String, dynamic> json,
) => UpdateSupportMacroDto(
  title: json['title'] as String?,
  body: json['body'] as String?,
  category: json['category'] == null
      ? null
      : UpdateSupportMacroDtoCategory.fromJson(json['category'] as String),
  active: json['active'] as bool?,
);

Map<String, dynamic> _$UpdateSupportMacroDtoToJson(
  UpdateSupportMacroDto instance,
) => <String, dynamic>{
  'title': ?instance.title,
  'body': ?instance.body,
  'category': ?instance.category?.toJson(),
  'active': ?instance.active,
};
