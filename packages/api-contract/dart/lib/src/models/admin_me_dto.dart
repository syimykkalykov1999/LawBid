// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_me_dto_role.dart';

part 'admin_me_dto.g.dart';

@JsonSerializable()
class AdminMeDto {
  const AdminMeDto({
    required this.id,
    required this.email,
    required this.role,
    required this.totpEnabled,
    required this.lastLoginAt,
  });

  factory AdminMeDto.fromJson(Map<String, Object?> json) =>
      _$AdminMeDtoFromJson(json);

  final String id;
  final String email;
  final AdminMeDtoRole role;
  final bool totpEnabled;
  final DateTime? lastLoginAt;

  Map<String, Object?> toJson() => _$AdminMeDtoToJson(this);
}
