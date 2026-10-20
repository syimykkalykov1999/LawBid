// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'qr_login_create_dto.g.dart';

@JsonSerializable()
class QrLoginCreateDto {
  const QrLoginCreateDto({this.deviceInfo});

  factory QrLoginCreateDto.fromJson(Map<String, Object?> json) =>
      _$QrLoginCreateDtoFromJson(json);

  /// The browser (shown to the phone owner before approving).
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$QrLoginCreateDtoToJson(this);
}
