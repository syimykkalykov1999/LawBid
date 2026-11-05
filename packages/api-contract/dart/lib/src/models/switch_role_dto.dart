// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'switch_role_dto_role.dart';

part 'switch_role_dto.g.dart';

@JsonSerializable()
class SwitchRoleDto {
  const SwitchRoleDto({required this.role});

  factory SwitchRoleDto.fromJson(Map<String, Object?> json) =>
      _$SwitchRoleDtoFromJson(json);

  final SwitchRoleDtoRole role;

  Map<String, Object?> toJson() => _$SwitchRoleDtoToJson(this);
}
