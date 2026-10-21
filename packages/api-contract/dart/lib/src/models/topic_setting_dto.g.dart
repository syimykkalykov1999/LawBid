// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'topic_setting_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopicSettingDto _$TopicSettingDtoFromJson(Map<String, dynamic> json) =>
    TopicSettingDto(
      topic: NotificationTopic.fromJson(json['topic'] as String),
      pushEnabled: json['pushEnabled'] as bool,
    );

Map<String, dynamic> _$TopicSettingDtoToJson(TopicSettingDto instance) =>
    <String, dynamic>{
      'topic': instance.topic.toJson(),
      'pushEnabled': instance.pushEnabled,
    };
