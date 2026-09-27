// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'otp_verify_link_dto.g.dart';

@JsonSerializable()
class OtpVerifyLinkDto {
  const OtpVerifyLinkDto({
    required this.token,
    required this.verifier,
    this.deviceInfo,
  });

  factory OtpVerifyLinkDto.fromJson(Map<String, Object?> json) =>
      _$OtpVerifyLinkDtoFromJson(json);

  final String token;
  final String verifier;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$OtpVerifyLinkDtoToJson(this);
}
