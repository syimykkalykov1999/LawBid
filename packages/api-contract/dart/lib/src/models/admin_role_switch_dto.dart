// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_role_switch_dto.g.dart';

@JsonSerializable()
class AdminRoleSwitchDto {
  const AdminRoleSwitchDto({
    required this.from,
    required this.to,
    required this.reverted,
    required this.ip,
    required this.at,
  });

  factory AdminRoleSwitchDto.fromJson(Map<String, Object?> json) =>
      _$AdminRoleSwitchDtoFromJson(json);

  final String from;
  final String to;

  /// Went back from an unfinished onboarding of the new profile.
  final bool reverted;
  final String? ip;
  final DateTime at;

  Map<String, Object?> toJson() => _$AdminRoleSwitchDtoToJson(this);
}
