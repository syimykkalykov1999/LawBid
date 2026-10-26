// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'topic_setting_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopicSettingViewDto _$TopicSettingViewDtoFromJson(Map<String, dynamic> json) =>
    TopicSettingViewDto(
      topic: NotificationTopic.fromJson(json['topic'] as String),
      block: NotificationTopicBlock.fromJson(json['block'] as String),
      pushEnabled: json['pushEnabled'] as bool,
      locked: json['locked'] as bool,
      attorneyOnly: json['attorneyOnly'] as bool,
      parent: json['parent'] as String?,
    );

Map<String, dynamic> _$TopicSettingViewDtoToJson(
  TopicSettingViewDto instance,
) => <String, dynamic>{
  'topic': instance.topic.toJson(),
  'block': instance.block.toJson(),
  'pushEnabled': instance.pushEnabled,
  'locked': instance.locked,
  'attorneyOnly': instance.attorneyOnly,
  'parent': ?instance.parent,
};
