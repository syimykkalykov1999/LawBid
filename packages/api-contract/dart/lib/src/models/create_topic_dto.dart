// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_topic_dto.g.dart';

@JsonSerializable()
class CreateTopicDto {
  const CreateTopicDto({required this.title, this.iconEmoji, this.color});

  factory CreateTopicDto.fromJson(Map<String, Object?> json) =>
      _$CreateTopicDtoFromJson(json);

  final String title;

  /// One emoji.
  final String? iconEmoji;
  final num? color;

  Map<String, Object?> toJson() => _$CreateTopicDtoToJson(this);
}
