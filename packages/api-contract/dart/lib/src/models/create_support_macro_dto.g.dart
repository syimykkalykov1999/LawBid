// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_support_macro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateSupportMacroDto _$CreateSupportMacroDtoFromJson(
  Map<String, dynamic> json,
) => CreateSupportMacroDto(
  title: json['title'] as String,
  body: json['body'] as String,
  active: json['active'] as bool? ?? true,
  category: json['category'] == null
      ? null
      : CreateSupportMacroDtoCategory.fromJson(json['category'] as String),
);

Map<String, dynamic> _$CreateSupportMacroDtoToJson(
  CreateSupportMacroDto instance,
) => <String, dynamic>{
  'title': instance.title,
  'body': instance.body,
  'category': ?instance.category?.toJson(),
  'active': instance.active,
};
