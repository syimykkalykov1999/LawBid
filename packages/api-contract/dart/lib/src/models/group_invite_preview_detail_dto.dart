// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_invite_dto.dart';
import 'group_message_dto.dart';
import 'group_person_dto.dart';

part 'group_invite_preview_detail_dto.g.dart';

@JsonSerializable()
class GroupInvitePreviewDetailDto {
  const GroupInvitePreviewDetailDto({
    required this.invite,
    required this.readable,
    required this.members,
    required this.messages,
    this.description,
  });

  factory GroupInvitePreviewDetailDto.fromJson(Map<String, Object?> json) =>
      _$GroupInvitePreviewDetailDtoFromJson(json);

  final GroupInviteDto invite;
  final String? description;

  /// Members and messages are included (open group).
  final bool readable;
  final List<GroupPersonDto> members;

  /// Newest first.
  final List<GroupMessageDto> messages;

  Map<String, Object?> toJson() => _$GroupInvitePreviewDetailDtoToJson(this);
}
