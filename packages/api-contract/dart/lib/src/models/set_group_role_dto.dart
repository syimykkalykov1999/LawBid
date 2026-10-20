// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_group_role_dto_role.dart';

part 'set_group_role_dto.g.dart';

@JsonSerializable()
class SetGroupRoleDto {
  const SetGroupRoleDto({required this.role});

  factory SetGroupRoleDto.fromJson(Map<String, Object?> json) =>
      _$SetGroupRoleDtoFromJson(json);

  final SetGroupRoleDtoRole role;

  Map<String, Object?> toJson() => _$SetGroupRoleDtoToJson(this);
}
