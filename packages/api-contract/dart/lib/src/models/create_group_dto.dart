// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_type.dart';

part 'create_group_dto.g.dart';

@JsonSerializable()
class CreateGroupDto {
  const CreateGroupDto({
    required this.title,
    required this.memberIds,
    this.type = GroupType.private,
    this.description,
    this.avatarFileId,
    this.username,
    this.joinApproval,
  });

  factory CreateGroupDto.fromJson(Map<String, Object?> json) =>
      _$CreateGroupDtoFromJson(json);

  final String title;
  final String? description;

  /// A clean `avatar` file of the creator.
  final String? avatarFileId;

  /// public: @username, search, anyone joins. closed: join by the invite link. private: people are added.
  final GroupType type;

  /// Required for a public group.
  final String? username;

  /// closed groups: new members wait for an admin.
  final bool? joinApproval;

  /// People to add (the creator is added automatically); may be empty for public / closed groups.
  final List<String> memberIds;

  Map<String, Object?> toJson() => _$CreateGroupDtoToJson(this);
}
