// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_group_role_dto_rights.dart';
import 'set_group_role_dto_role.dart';

part 'set_group_role_dto.g.dart';

@JsonSerializable()
class SetGroupRoleDto {
  const SetGroupRoleDto({
    required this.role,
    this.rights,
  });
  
  factory SetGroupRoleDto.fromJson(Map<String, Object?> json) => _$SetGroupRoleDtoFromJson(json);
  
  final SetGroupRoleDtoRole role;

  /// Admin checkboxes (role admin); default = the usual six.
  final List<SetGroupRoleDtoRights>? rights;

  Map<String, Object?> toJson() => _$SetGroupRoleDtoToJson(this);
}
