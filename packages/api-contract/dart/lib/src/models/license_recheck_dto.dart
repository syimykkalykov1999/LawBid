// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_license_dto.dart';
import 'check_result.dart';

part 'license_recheck_dto.g.dart';

@JsonSerializable()
class LicenseRecheckDto {
  const LicenseRecheckDto({
    required this.license,
    required this.result,
    required this.requestId,
  });

  factory LicenseRecheckDto.fromJson(Map<String, Object?> json) =>
      _$LicenseRecheckDtoFromJson(json);

  final AdminLicenseDto license;
  final CheckResult result;

  /// The request the license was queued in for manual review, null when the lookup passed.
  final String? requestId;

  Map<String, Object?> toJson() => _$LicenseRecheckDtoToJson(this);
}
