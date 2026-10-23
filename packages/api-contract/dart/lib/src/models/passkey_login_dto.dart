// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'passkey_login_dto.g.dart';

@JsonSerializable()
class PasskeyLoginDto {
  const PasskeyLoginDto({
    required this.challengeId,
    required this.response,
    this.deviceInfo,
  });

  factory PasskeyLoginDto.fromJson(Map<String, Object?> json) =>
      _$PasskeyLoginDtoFromJson(json);

  final String challengeId;

  /// AuthenticationResponseJSON from the authenticator.
  final dynamic response;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$PasskeyLoginDtoToJson(this);
}
