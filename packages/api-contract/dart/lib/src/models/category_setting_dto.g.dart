// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'category_setting_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CategorySettingDto _$CategorySettingDtoFromJson(Map<String, dynamic> json) =>
    CategorySettingDto(
      category: CategorySettingDtoCategory.fromJson(json['category'] as String),
      pushEnabled: json['pushEnabled'] as bool,
      emailEnabled: json['emailEnabled'] as bool,
    );

Map<String, dynamic> _$CategorySettingDtoToJson(CategorySettingDto instance) =>
    <String, dynamic>{
      'category': instance.category.toJson(),
      'pushEnabled': instance.pushEnabled,
      'emailEnabled': instance.emailEnabled,
    };
