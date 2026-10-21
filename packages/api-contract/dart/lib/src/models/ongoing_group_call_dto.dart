// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ongoing_group_call_dto.g.dart';

@JsonSerializable()
class OngoingGroupCallDto {
  const OngoingGroupCallDto({
    required this.id,
    required this.groupId,
    required this.groupTitle,
    required this.video,
    required this.joined,
    required this.mine,
    required this.startedAt,
    this.groupAvatarUrl,
  });

  factory OngoingGroupCallDto.fromJson(Map<String, Object?> json) =>
      _$OngoingGroupCallDtoFromJson(json);

  final String id;
  final String groupId;
  final String groupTitle;
  final String? groupAvatarUrl;
  final bool video;

  /// People in the call now.
  final int joined;

  /// I am in it now (the button says «Return»).
  final bool mine;
  final DateTime startedAt;

  Map<String, Object?> toJson() => _$OngoingGroupCallDtoToJson(this);
}
