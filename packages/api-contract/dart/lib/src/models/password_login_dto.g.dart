// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'password_login_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasswordLoginDto _$PasswordLoginDtoFromJson(Map<String, dynamic> json) =>
    PasswordLoginDto(
      identifier: json['identifier'] as String,
      password: json['password'] as String,
      deviceInfo: json['deviceInfo'] == null
          ? null
          : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PasswordLoginDtoToJson(PasswordLoginDto instance) =>
    <String, dynamic>{
      'identifier': instance.identifier,
      'password': instance.password,
      'deviceInfo': ?instance.deviceInfo?.toJson(),
    };
