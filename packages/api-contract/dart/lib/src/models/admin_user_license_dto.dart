// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_user_license_dto.g.dart';

@JsonSerializable()
class AdminUserLicenseDto {
  const AdminUserLicenseDto({
    required this.stateCode,
    required this.barNumber,
    required this.status,
    required this.expiresAt,
  });

  factory AdminUserLicenseDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserLicenseDtoFromJson(json);

  final String stateCode;
  final String barNumber;
  final String status;
  final DateTime? expiresAt;

  Map<String, Object?> toJson() => _$AdminUserLicenseDtoToJson(this);
}
