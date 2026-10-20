// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_member_dto_kind.dart';
import 'group_member_dto_rights.dart';
import 'group_role.dart';

part 'group_member_dto.g.dart';

@JsonSerializable()
class GroupMemberDto {
  const GroupMemberDto({
    required this.userId,
    required this.kind,
    required this.verifiedBadge,
    required this.role,
    required this.rights,
    required this.joinedAt,
    this.displayName,
    this.username,
    this.avatarUrl,
  });

  factory GroupMemberDto.fromJson(Map<String, Object?> json) =>
      _$GroupMemberDtoFromJson(json);

  final String userId;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final GroupMemberDtoKind kind;
  final bool verifiedBadge;
  final GroupRole role;

  /// An admin's checkboxes (owner: all, member: none).
  final List<GroupMemberDtoRights> rights;
  final DateTime joinedAt;

  Map<String, Object?> toJson() => _$GroupMemberDtoToJson(this);
}
