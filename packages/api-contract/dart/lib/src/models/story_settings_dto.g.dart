// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorySettingsDto _$StorySettingsDtoFromJson(Map<String, dynamic> json) =>
    StorySettingsDto(
      audience: StoryAudience.fromJson(json['audience'] as String),
      allowReplies: json['allowReplies'] as bool,
      hiddenCount: (json['hiddenCount'] as num).toInt(),
    );

Map<String, dynamic> _$StorySettingsDtoToJson(StorySettingsDto instance) =>
    <String, dynamic>{
      'audience': instance.audience.toJson(),
      'allowReplies': instance.allowReplies,
      'hiddenCount': instance.hiddenCount,
    };
