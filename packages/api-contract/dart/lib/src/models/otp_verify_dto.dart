// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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
  });

  factory OtpVerifyDto.fromJson(Map<String, Object?> json) =>
      _$OtpVerifyDtoFromJson(json);

  final OtpVerifyDtoChannel channel;
  final String identifier;
  final String code;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$OtpVerifyDtoToJson(this);
}
