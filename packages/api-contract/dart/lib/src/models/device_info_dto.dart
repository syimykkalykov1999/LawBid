// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'device_info_dto.g.dart';

@JsonSerializable()
class DeviceInfoDto {
  const DeviceInfoDto({
    this.deviceId,
    this.deviceName,
    this.platform,
    this.appVersion,
  });

  factory DeviceInfoDto.fromJson(Map<String, Object?> json) =>
      _$DeviceInfoDtoFromJson(json);

  final String? deviceId;
  final String? deviceName;
  final String? platform;
  final String? appVersion;

  Map<String, Object?> toJson() => _$DeviceInfoDtoToJson(this);
}
