// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_type.dart';

part 'group_invite_preview_dto.g.dart';

@JsonSerializable()
class GroupInvitePreviewDto {
  const GroupInvitePreviewDto({
    required this.id,
    required this.code,
    required this.type,
    required this.requiresApproval,
    required this.requestPending,
    required this.title,
    required this.memberCount,
    required this.alreadyMember,
    this.username,
    this.description,
    this.avatarUrl,
  });

  factory GroupInvitePreviewDto.fromJson(Map<String, Object?> json) =>
      _$GroupInvitePreviewDtoFromJson(json);

  final String id;

  /// Pass this to POST /groups/join/{code} (username or invite).
  final String code;
  final GroupType type;
  final String? username;

  /// Joining needs an admin to approve.
  final bool requiresApproval;

  /// I already asked to join.
  final bool requestPending;
  final String title;
  final String? description;
  final String? avatarUrl;
  final num memberCount;

  /// I am already in this group.
  final bool alreadyMember;

  Map<String, Object?> toJson() => _$GroupInvitePreviewDtoToJson(this);
}
