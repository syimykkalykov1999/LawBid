// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mls_device_platform.dart';

part 'register_mls_device_dto.g.dart';

@JsonSerializable()
class RegisterMlsDeviceDto {
  const RegisterMlsDeviceDto({
    required this.signatureKey,
    required this.platform,
  });

  factory RegisterMlsDeviceDto.fromJson(Map<String, Object?> json) =>
      _$RegisterMlsDeviceDtoFromJson(json);

  /// Base64 of the Ed25519 public key of the device’s MLS credential (32 bytes).
  final String signatureKey;
  final MlsDevicePlatform platform;

  Map<String, Object?> toJson() => _$RegisterMlsDeviceDtoToJson(this);
}
