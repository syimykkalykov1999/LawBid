// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_notice_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationNoticeListEnvelope _$ModerationNoticeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ModerationNoticeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ModerationNoticeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ModerationNoticeListEnvelopeToJson(
  ModerationNoticeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
