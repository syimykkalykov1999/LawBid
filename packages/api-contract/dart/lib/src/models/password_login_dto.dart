// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'password_login_dto.g.dart';

@JsonSerializable()
class PasswordLoginDto {
  const PasswordLoginDto({
    required this.identifier,
    required this.password,
    this.deviceInfo,
  });

  factory PasswordLoginDto.fromJson(Map<String, Object?> json) =>
      _$PasswordLoginDtoFromJson(json);

  /// E.164 phone number or e-mail address.
  final String identifier;
  final String password;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$PasswordLoginDtoToJson(this);
}
