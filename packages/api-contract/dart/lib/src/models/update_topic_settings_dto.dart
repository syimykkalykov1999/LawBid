// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'topic_setting_dto.dart';

part 'update_topic_settings_dto.g.dart';

@JsonSerializable()
class UpdateTopicSettingsDto {
  const UpdateTopicSettingsDto({required this.items});

  factory UpdateTopicSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTopicSettingsDtoFromJson(json);

  final List<TopicSettingDto> items;

  Map<String, Object?> toJson() => _$UpdateTopicSettingsDtoToJson(this);
}
