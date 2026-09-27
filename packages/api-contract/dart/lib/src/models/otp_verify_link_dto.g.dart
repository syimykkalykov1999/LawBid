// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'otp_verify_link_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OtpVerifyLinkDto _$OtpVerifyLinkDtoFromJson(Map<String, dynamic> json) =>
    OtpVerifyLinkDto(
      token: json['token'] as String,
      verifier: json['verifier'] as String,
      deviceInfo: json['deviceInfo'] == null
          ? null
          : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$OtpVerifyLinkDtoToJson(OtpVerifyLinkDto instance) =>
    <String, dynamic>{
      'token': instance.token,
      'verifier': instance.verifier,
      'deviceInfo': ?instance.deviceInfo?.toJson(),
    };
