// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_channel_dto.g.dart';

@JsonSerializable()
class CreateChannelDto {
  const CreateChannelDto({
    required this.title,
    required this.username,
    this.description,
    this.avatarFileId,
    this.commentsEnabled,
  });

  factory CreateChannelDto.fromJson(Map<String, Object?> json) =>
      _$CreateChannelDtoFromJson(json);

  final String title;

  /// 5–32 letters, digits or _, starting with a letter, no «__», not ending with _.
  final String username;
  final String? description;
  final String? avatarFileId;
  final bool? commentsEnabled;

  Map<String, Object?> toJson() => _$CreateChannelDtoToJson(this);
}
