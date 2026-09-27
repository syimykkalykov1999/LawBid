// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'otp_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OtpRequestDto _$OtpRequestDtoFromJson(Map<String, dynamic> json) =>
    OtpRequestDto(
      channel: OtpRequestDtoChannel.fromJson(json['channel'] as String),
      identifier: json['identifier'] as String,
      linkChallenge: json['linkChallenge'] as String?,
    );

Map<String, dynamic> _$OtpRequestDtoToJson(OtpRequestDto instance) =>
    <String, dynamic>{
      'channel': instance.channel.toJson(),
      'identifier': instance.identifier,
      'linkChallenge': ?instance.linkChallenge,
    };
