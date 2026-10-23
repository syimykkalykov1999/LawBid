// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_login_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyLoginDto _$PasskeyLoginDtoFromJson(Map<String, dynamic> json) =>
    PasskeyLoginDto(
      challengeId: json['challengeId'] as String,
      response: json['response'],
      deviceInfo: json['deviceInfo'] == null
          ? null
          : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PasskeyLoginDtoToJson(PasskeyLoginDto instance) =>
    <String, dynamic>{
      'challengeId': instance.challengeId,
      'response': ?instance.response,
      'deviceInfo': ?instance.deviceInfo?.toJson(),
    };
