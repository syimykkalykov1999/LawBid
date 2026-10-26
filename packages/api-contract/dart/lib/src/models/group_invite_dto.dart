// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto.dart';
import 'group_type.dart';

part 'group_invite_dto.g.dart';

@JsonSerializable()
class GroupInviteDto {
  const GroupInviteDto({
    required this.id,
    required this.groupId,
    required this.title,
    required this.memberCount,
    required this.type,
    required this.inviter,
    required this.createdAt,
    this.avatarUrl,
  });

  factory GroupInviteDto.fromJson(Map<String, Object?> json) =>
      _$GroupInviteDtoFromJson(json);

  final String id;
  final String groupId;
  final String title;
  final String? avatarUrl;
  final num memberCount;
  final GroupType type;
  final GroupPersonDto inviter;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$GroupInviteDtoToJson(this);
}
