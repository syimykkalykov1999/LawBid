// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_login_options_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyLoginOptionsDto _$PasskeyLoginOptionsDtoFromJson(
  Map<String, dynamic> json,
) => PasskeyLoginOptionsDto(
  deviceInfo: json['deviceInfo'] == null
      ? null
      : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PasskeyLoginOptionsDtoToJson(
  PasskeyLoginOptionsDto instance,
) => <String, dynamic>{'deviceInfo': ?instance.deviceInfo?.toJson()};
