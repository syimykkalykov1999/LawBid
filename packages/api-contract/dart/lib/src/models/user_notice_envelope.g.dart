// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_notice_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserNoticeEnvelope _$UserNoticeEnvelopeFromJson(Map<String, dynamic> json) =>
    UserNoticeEnvelope(
      data: UserNoticeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$UserNoticeEnvelopeToJson(UserNoticeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
