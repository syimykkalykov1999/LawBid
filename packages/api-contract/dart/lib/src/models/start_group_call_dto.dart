// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_group_call_dto.g.dart';

@JsonSerializable()
class StartGroupCallDto {
  const StartGroupCallDto({
    this.video,
    this.userIds,
  });
  
  factory StartGroupCallDto.fromJson(Map<String, Object?> json) => _$StartGroupCallDtoFromJson(json);
  
  /// Video call (default: audio).
  final bool? video;

  /// Group members to ring (up to the size of the call minus the host); the rest of the group can join from the chat.
  final List<String>? userIds;

  Map<String, Object?> toJson() => _$StartGroupCallDtoToJson(this);
}
