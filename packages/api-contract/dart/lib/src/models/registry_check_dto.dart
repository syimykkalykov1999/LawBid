// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_license_dto.dart';
import 'check_result.dart';

part 'registry_check_dto.g.dart';

@JsonSerializable()
class RegistryCheckDto {
  const RegistryCheckDto({
    required this.license,
    required this.result,
    required this.details,
  });

  factory RegistryCheckDto.fromJson(Map<String, Object?> json) =>
      _$RegistryCheckDtoFromJson(json);

  final AdminLicenseDto license;
  final CheckResult result;
  final dynamic details;

  Map<String, Object?> toJson() => _$RegistryCheckDtoToJson(this);
}
