// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'license_status.dart';
import 'state_ref_dto.dart';

part 'own_license_dto.g.dart';

@JsonSerializable()
class OwnLicenseDto {
  const OwnLicenseDto({
    required this.id,
    required this.state,
    required this.barNumber,
    required this.status,
    required this.expiresAt,
    required this.rejectionCode,
  });

  factory OwnLicenseDto.fromJson(Map<String, Object?> json) =>
      _$OwnLicenseDtoFromJson(json);

  final String id;
  final StateRefDto state;
  final String barNumber;
  final LicenseStatus status;
  final DateTime? expiresAt;

  /// verification.reject.<code> when status = rejected.
  final String? rejectionCode;

  Map<String, Object?> toJson() => _$OwnLicenseDtoToJson(this);
}
