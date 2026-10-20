// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_notice_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationNoticeEnvelope _$ModerationNoticeEnvelopeFromJson(
  Map<String, dynamic> json,
) => ModerationNoticeEnvelope(
  data: ModerationNoticeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ModerationNoticeEnvelopeToJson(
  ModerationNoticeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
