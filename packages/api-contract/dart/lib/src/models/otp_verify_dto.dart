// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'age_attestation_dto.dart';
import 'device_info_dto.dart';
import 'otp_verify_dto_channel.dart';

part 'otp_verify_dto.g.dart';

@JsonSerializable()
class OtpVerifyDto {
  const OtpVerifyDto({
    required this.channel,
    required this.identifier,
    required this.code,
    this.deviceInfo,
    this.ageAttestation,
  });

  factory OtpVerifyDto.fromJson(Map<String, Object?> json) =>
      _$OtpVerifyDtoFromJson(json);

  final OtpVerifyDtoChannel channel;
  final String identifier;
  final String code;
  final DeviceInfoDto? deviceInfo;

  /// 2026-10-25 (COPPA): "I am 18 or older", for a NEW account only.
  final AgeAttestationDto? ageAttestation;

  Map<String, Object?> toJson() => _$OtpVerifyDtoToJson(this);
}
