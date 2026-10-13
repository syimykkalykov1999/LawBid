// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'password_reset_confirm_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasswordResetConfirmDto _$PasswordResetConfirmDtoFromJson(
  Map<String, dynamic> json,
) => PasswordResetConfirmDto(
  newPassword: json['newPassword'] as String,
  identifier: json['identifier'] as String,
  code: json['code'] as String,
  deviceInfo: json['deviceInfo'] == null
      ? null
      : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PasswordResetConfirmDtoToJson(
  PasswordResetConfirmDto instance,
) => <String, dynamic>{
  'newPassword': instance.newPassword,
  'identifier': instance.identifier,
  'code': instance.code,
  'deviceInfo': ?instance.deviceInfo?.toJson(),
};
