// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_story_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateStorySettingsDto _$UpdateStorySettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateStorySettingsDto(
  audience: json['audience'] == null
      ? null
      : StoryAudience.fromJson(json['audience'] as String),
  allowReplies: json['allowReplies'] as bool?,
);

Map<String, dynamic> _$UpdateStorySettingsDtoToJson(
  UpdateStorySettingsDto instance,
) => <String, dynamic>{
  'audience': ?instance.audience?.toJson(),
  'allowReplies': ?instance.allowReplies,
};
