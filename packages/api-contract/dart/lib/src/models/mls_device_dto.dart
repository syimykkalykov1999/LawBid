// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mls_device_platform.dart';

part 'mls_device_dto.g.dart';

@JsonSerializable()
class MlsDeviceDto {
  const MlsDeviceDto({
    required this.id,
    required this.userId,
    required this.signatureKey,
    required this.platform,
    required this.identity,
    required this.createdAt,
  });

  factory MlsDeviceDto.fromJson(Map<String, Object?> json) =>
      _$MlsDeviceDtoFromJson(json);

  final String id;
  final String userId;

  /// Base64 Ed25519 public signature key.
  final String signatureKey;
  final MlsDevicePlatform platform;

  /// The MLS credential identity this device must use.
  final String identity;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$MlsDeviceDtoToJson(this);
}
