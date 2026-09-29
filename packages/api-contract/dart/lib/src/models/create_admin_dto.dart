// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_admin_dto_role.dart';

part 'create_admin_dto.g.dart';

@JsonSerializable()
class CreateAdminDto {
  const CreateAdminDto({required this.email, required this.role});

  factory CreateAdminDto.fromJson(Map<String, Object?> json) =>
      _$CreateAdminDtoFromJson(json);

  final String email;
  final CreateAdminDtoRole role;

  Map<String, Object?> toJson() => _$CreateAdminDtoToJson(this);
}
