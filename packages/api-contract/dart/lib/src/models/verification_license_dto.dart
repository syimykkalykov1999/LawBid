// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'license_status.dart';
import 'state_ref_dto.dart';

part 'verification_license_dto.g.dart';

@JsonSerializable()
class VerificationLicenseDto {
  const VerificationLicenseDto({
    required this.id,
    required this.state,
    required this.barNumber,
    required this.status,
    required this.expiresAt,
    required this.rejectionCode,
    required this.rejectionNote,
  });

  factory VerificationLicenseDto.fromJson(Map<String, Object?> json) =>
      _$VerificationLicenseDtoFromJson(json);

  final String id;
  final StateRefDto state;
  final String barNumber;
  final LicenseStatus status;
  final DateTime? expiresAt;

  /// Rejection code (`verification.reject.<code>`).
  final String? rejectionCode;
  final String? rejectionNote;

  Map<String, Object?> toJson() => _$VerificationLicenseDtoToJson(this);
}
