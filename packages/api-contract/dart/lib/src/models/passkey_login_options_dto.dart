// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'passkey_login_options_dto.g.dart';

@JsonSerializable()
class PasskeyLoginOptionsDto {
  const PasskeyLoginOptionsDto({this.deviceInfo});

  factory PasskeyLoginOptionsDto.fromJson(Map<String, Object?> json) =>
      _$PasskeyLoginOptionsDtoFromJson(json);

  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$PasskeyLoginOptionsDtoToJson(this);
}
