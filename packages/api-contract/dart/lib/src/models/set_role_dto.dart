// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_role_dto_role.dart';

part 'set_role_dto.g.dart';

@JsonSerializable()
class SetRoleDto {
  const SetRoleDto({required this.role});

  factory SetRoleDto.fromJson(Map<String, Object?> json) =>
      _$SetRoleDtoFromJson(json);

  final SetRoleDtoRole role;

  Map<String, Object?> toJson() => _$SetRoleDtoToJson(this);
}
