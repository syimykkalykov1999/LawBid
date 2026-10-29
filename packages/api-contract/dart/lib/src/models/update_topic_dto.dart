// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_topic_dto.g.dart';

@JsonSerializable()
class UpdateTopicDto {
  const UpdateTopicDto({
    this.title,
    this.iconEmoji,
    this.color,
    this.closed,
    this.pinned,
  });
  
  factory UpdateTopicDto.fromJson(Map<String, Object?> json) => _$UpdateTopicDtoFromJson(json);
  
  final String? title;
  final String? iconEmoji;
  final num? color;

  /// Close (true) / reopen (false).
  final bool? closed;

  /// Pin to the top of the topics.
  final bool? pinned;

  Map<String, Object?> toJson() => _$UpdateTopicDtoToJson(this);
}
