// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_type.dart';
import 'update_group_dto_who_can_add.dart';
import 'update_group_dto_who_can_call.dart';
import 'update_group_dto_who_can_edit_info.dart';
import 'update_group_dto_who_can_post.dart';

part 'update_group_dto.g.dart';

@JsonSerializable()
class UpdateGroupDto {
  const UpdateGroupDto({
    this.title,
    this.description,
    this.avatarFileId,
    this.whoCanPost,
    this.whoCanAdd,
    this.whoCanEditInfo,
    this.whoCanCall,
    this.showServiceMessages,
    this.inviteEnabled,
    this.type,
    this.username,
    this.joinApproval,
    this.topicsEnabled,
  });

  factory UpdateGroupDto.fromJson(Map<String, Object?> json) =>
      _$UpdateGroupDtoFromJson(json);

  final String? title;

  /// Empty string clears it.
  final String? description;

  /// A new clean `avatar` file; null removes the photo.
  final String? avatarFileId;

  /// Admins only.
  final UpdateGroupDtoWhoCanPost? whoCanPost;

  /// Admins only.
  final UpdateGroupDtoWhoCanAdd? whoCanAdd;

  /// Admins only.
  final UpdateGroupDtoWhoCanEditInfo? whoCanEditInfo;

  /// Admins only.
  final UpdateGroupDtoWhoCanCall? whoCanCall;

  /// Admins only: show service lines (created, joined, left, renamed…) to everyone.
  final bool? showServiceMessages;

  /// Admins only: the join link on/off.
  final bool? inviteEnabled;

  /// Admins only: public / closed / private.
  final GroupType? type;

  /// Admins only: the @username of a public group.
  final String? username;

  /// Admins only (closed groups).
  final bool? joinApproval;

  /// Admins only: forum mode (topics).
  final bool? topicsEnabled;

  Map<String, Object?> toJson() => _$UpdateGroupDtoToJson(this);
}
