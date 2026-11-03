// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quick_reply_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuickReplyEnvelope _$QuickReplyEnvelopeFromJson(Map<String, dynamic> json) =>
    QuickReplyEnvelope(
      data: QuickReplyDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$QuickReplyEnvelopeToJson(QuickReplyEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
