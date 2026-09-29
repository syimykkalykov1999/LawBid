// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_admin_role_dto_role.dart';

part 'set_admin_role_dto.g.dart';

@JsonSerializable()
class SetAdminRoleDto {
  const SetAdminRoleDto({required this.role});

  factory SetAdminRoleDto.fromJson(Map<String, Object?> json) =>
      _$SetAdminRoleDtoFromJson(json);

  final SetAdminRoleDtoRole role;

  Map<String, Object?> toJson() => _$SetAdminRoleDtoToJson(this);
}
