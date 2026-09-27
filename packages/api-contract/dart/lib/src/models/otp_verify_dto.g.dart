// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'otp_verify_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OtpVerifyDto _$OtpVerifyDtoFromJson(Map<String, dynamic> json) => OtpVerifyDto(
  channel: OtpVerifyDtoChannel.fromJson(json['channel'] as String),
  identifier: json['identifier'] as String,
  code: json['code'] as String,
  deviceInfo: json['deviceInfo'] == null
      ? null
      : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OtpVerifyDtoToJson(OtpVerifyDto instance) =>
    <String, dynamic>{
      'channel': instance.channel.toJson(),
      'identifier': instance.identifier,
      'code': instance.code,
      'deviceInfo': ?instance.deviceInfo?.toJson(),
    };
