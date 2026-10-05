// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_macro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportMacroDto _$SupportMacroDtoFromJson(Map<String, dynamic> json) =>
    SupportMacroDto(
      id: json['id'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      active: json['active'] as bool,
      uses: json['uses'] as num,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      category: json['category'] == null
          ? null
          : SupportMacroDtoCategory.fromJson(json['category'] as String),
    );

Map<String, dynamic> _$SupportMacroDtoToJson(SupportMacroDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'body': instance.body,
      'category': ?instance.category?.toJson(),
      'active': instance.active,
      'uses': instance.uses,
      'updatedAt': instance.updatedAt.toIso8601String(),
    };
