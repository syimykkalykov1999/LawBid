// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notification_topic.dart';

part 'topic_setting_dto.g.dart';

@JsonSerializable()
class TopicSettingDto {
  const TopicSettingDto({required this.topic, required this.pushEnabled});

  factory TopicSettingDto.fromJson(Map<String, Object?> json) =>
      _$TopicSettingDtoFromJson(json);

  final NotificationTopic topic;
  final bool pushEnabled;

  Map<String, Object?> toJson() => _$TopicSettingDtoToJson(this);
}
