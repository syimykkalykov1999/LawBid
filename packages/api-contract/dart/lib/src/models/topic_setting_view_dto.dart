// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notification_topic.dart';
import 'notification_topic_block.dart';

part 'topic_setting_view_dto.g.dart';

@JsonSerializable()
class TopicSettingViewDto {
  const TopicSettingViewDto({
    required this.topic,
    required this.block,
    required this.pushEnabled,
    required this.locked,
    required this.attorneyOnly,
    this.parent,
  });
  
  factory TopicSettingViewDto.fromJson(Map<String, Object?> json) => _$TopicSettingViewDtoFromJson(json);
  
  final NotificationTopic topic;
  final NotificationTopicBlock block;
  final bool pushEnabled;

  /// Can't be turned off.
  final bool locked;

  /// Shown to attorneys only.
  final bool attorneyOnly;

  /// Needs this switch on too (shown nested under it).
  final String? parent;

  Map<String, Object?> toJson() => _$TopicSettingViewDtoToJson(this);
}
