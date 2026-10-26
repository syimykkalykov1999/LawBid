// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_channel_dto.g.dart';

@JsonSerializable()
class UpdateChannelDto {
  const UpdateChannelDto({
    this.title,
    this.username,
    this.description,
    this.avatarFileId,
    this.removeAvatar,
    this.commentsEnabled,
    this.protectContent,
  });

  factory UpdateChannelDto.fromJson(Map<String, Object?> json) =>
      _$UpdateChannelDtoFromJson(json);

  final String? title;

  /// Owner only.
  final String? username;
  final String? description;
  final String? avatarFileId;

  /// true removes the avatar.
  final bool? removeAvatar;
  final bool? commentsEnabled;

  /// Owner 2026-10-21 (Telegram «Запретить копирование и пересылку»).
  final bool? protectContent;

  Map<String, Object?> toJson() => _$UpdateChannelDtoToJson(this);
}
