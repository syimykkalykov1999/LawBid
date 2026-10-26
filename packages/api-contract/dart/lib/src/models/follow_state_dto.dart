// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'follow_state_dto.g.dart';

@JsonSerializable()
class FollowStateDto {
  const FollowStateDto({required this.following, required this.followersCount});

  factory FollowStateDto.fromJson(Map<String, Object?> json) =>
      _$FollowStateDtoFromJson(json);

  /// Whether I follow this person now.
  final bool following;

  /// Their followers now (not-yet-flushed deltas included).
  final int followersCount;

  Map<String, Object?> toJson() => _$FollowStateDtoToJson(this);
}
