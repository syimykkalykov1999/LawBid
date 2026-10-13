// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'password_reset_confirm_dto.g.dart';

@JsonSerializable()
class PasswordResetConfirmDto {
  const PasswordResetConfirmDto({
    required this.newPassword,
    required this.identifier,
    required this.code,
    this.deviceInfo,
  });

  factory PasswordResetConfirmDto.fromJson(Map<String, Object?> json) =>
      _$PasswordResetConfirmDtoFromJson(json);

  final String newPassword;
  final String identifier;
  final String code;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$PasswordResetConfirmDtoToJson(this);
}
