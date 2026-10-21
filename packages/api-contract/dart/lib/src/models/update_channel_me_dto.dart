// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_channel_me_dto.g.dart';

@JsonSerializable()
class UpdateChannelMeDto {
  const UpdateChannelMeDto({
    this.mutedUntil,
    this.pinned,
    this.archived,
    this.read,
  });

  factory UpdateChannelMeDto.fromJson(Map<String, Object?> json) =>
      _$UpdateChannelMeDtoFromJson(json);

  /// Mute until; null unmutes.
  final DateTime? mutedUntil;

  /// Pin the channel to the top of my list.
  final bool? pinned;

  /// Move the channel to my Channels archive or back.
  final bool? archived;

  /// true = every post so far is read.
  final bool? read;

  Map<String, Object?> toJson() => _$UpdateChannelMeDtoToJson(this);
}
