// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_group_members_dto.g.dart';

@JsonSerializable()
class AddGroupMembersDto {
  const AddGroupMembersDto({required this.userIds});

  factory AddGroupMembersDto.fromJson(Map<String, Object?> json) =>
      _$AddGroupMembersDtoFromJson(json);

  final List<String> userIds;

  Map<String, Object?> toJson() => _$AddGroupMembersDtoToJson(this);
}
