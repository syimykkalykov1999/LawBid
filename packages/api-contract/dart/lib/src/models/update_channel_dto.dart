// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_who.dart';
import 'reaction_mode.dart';
import 'update_channel_dto_reactions_allowed.dart';

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
    this.whoCanPost,
    this.reactionsMode,
    this.reactionsAllowed,
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

  /// Owner only (inbox 26b): 'all' lets every subscriber publish.
  final ChannelWho? whoCanPost;

  /// Owner 2026-10-21 (inbox 26b): all / selected / off.
  final ReactionMode? reactionsMode;

  /// With reactionsMode «some»: the reactions left open (≥ 1).
  final List<UpdateChannelDtoReactionsAllowed>? reactionsAllowed;

  Map<String, Object?> toJson() => _$UpdateChannelDtoToJson(this);
}
