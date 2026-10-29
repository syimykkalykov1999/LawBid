// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_license_expiry_dto.g.dart';

@JsonSerializable()
class SetLicenseExpiryDto {
  const SetLicenseExpiryDto({
    required this.expiresAt,
  });
  
  factory SetLicenseExpiryDto.fromJson(Map<String, Object?> json) => _$SetLicenseExpiryDtoFromJson(json);
  
  final DateTime? expiresAt;

  Map<String, Object?> toJson() => _$SetLicenseExpiryDtoToJson(this);
}
