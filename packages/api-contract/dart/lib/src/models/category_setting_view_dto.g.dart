// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'category_setting_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CategorySettingViewDto _$CategorySettingViewDtoFromJson(
  Map<String, dynamic> json,
) => CategorySettingViewDto(
  category: CategorySettingViewDtoCategory.fromJson(json['category'] as String),
  pushEnabled: json['pushEnabled'] as bool,
  emailEnabled: json['emailEnabled'] as bool,
  locked: json['locked'] as bool,
);

Map<String, dynamic> _$CategorySettingViewDtoToJson(
  CategorySettingViewDto instance,
) => <String, dynamic>{
  'category': instance.category.toJson(),
  'pushEnabled': instance.pushEnabled,
  'emailEnabled': instance.emailEnabled,
  'locked': instance.locked,
};
