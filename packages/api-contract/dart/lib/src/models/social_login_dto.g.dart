// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'social_login_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SocialLoginDto _$SocialLoginDtoFromJson(Map<String, dynamic> json) =>
    SocialLoginDto(
      provider: SocialLoginDtoProvider.fromJson(json['provider'] as String),
      idToken: json['idToken'] as String,
      nonce: json['nonce'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      deviceInfo: json['deviceInfo'] == null
          ? null
          : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SocialLoginDtoToJson(SocialLoginDto instance) =>
    <String, dynamic>{
      'provider': instance.provider.toJson(),
      'idToken': instance.idToken,
      'nonce': instance.nonce,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'deviceInfo': ?instance.deviceInfo?.toJson(),
    };
