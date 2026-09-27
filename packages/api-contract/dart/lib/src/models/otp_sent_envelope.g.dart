// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'otp_sent_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OtpSentEnvelope _$OtpSentEnvelopeFromJson(Map<String, dynamic> json) =>
    OtpSentEnvelope(
      data: OtpSentDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$OtpSentEnvelopeToJson(OtpSentEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
