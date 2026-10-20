// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_group_me_dto.g.dart';

@JsonSerializable()
class UpdateGroupMeDto {
  const UpdateGroupMeDto({
    this.mutedUntil,
    this.pinned,
    this.hidden,
    this.archived,
  });

  factory UpdateGroupMeDto.fromJson(Map<String, Object?> json) =>
      _$UpdateGroupMeDtoFromJson(json);

  /// Mute until; null unmutes.
  final DateTime? mutedUntil;

  /// Pin the chat to the top of my list.
  final bool? pinned;

  /// Hide the chat from my list.
  final bool? hidden;

  /// Move the chat to my Archive or back.
  final bool? archived;

  Map<String, Object?> toJson() => _$UpdateGroupMeDtoToJson(this);
}
