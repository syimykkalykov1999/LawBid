// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'totp_enrollment_dto.g.dart';

@JsonSerializable()
class TotpEnrollmentDto {
  const TotpEnrollmentDto({required this.secret, required this.otpauthUri});

  factory TotpEnrollmentDto.fromJson(Map<String, Object?> json) =>
      _$TotpEnrollmentDtoFromJson(json);

  /// Base32 secret (manual entry).
  final String secret;

  /// otpauth:// URI for the QR code.
  final String otpauthUri;

  Map<String, Object?> toJson() => _$TotpEnrollmentDtoToJson(this);
}
