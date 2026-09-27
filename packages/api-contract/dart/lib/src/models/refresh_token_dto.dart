// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'refresh_token_dto.g.dart';

@JsonSerializable()
class RefreshTokenDto {
  const RefreshTokenDto({required this.refreshToken, this.deviceInfo});

  factory RefreshTokenDto.fromJson(Map<String, Object?> json) =>
      _$RefreshTokenDtoFromJson(json);

  final String refreshToken;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$RefreshTokenDtoToJson(this);
}
