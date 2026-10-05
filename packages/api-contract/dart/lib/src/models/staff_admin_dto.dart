// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_admin_dto.g.dart';

@JsonSerializable()
class StaffAdminDto {
  const StaffAdminDto({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  factory StaffAdminDto.fromJson(Map<String, Object?> json) =>
      _$StaffAdminDtoFromJson(json);

  final String id;
  final String? name;
  final String? email;
  final String? role;

  Map<String, Object?> toJson() => _$StaffAdminDtoToJson(this);
}
