// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gift_send_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GiftSendEnvelope _$GiftSendEnvelopeFromJson(Map<String, dynamic> json) =>
    GiftSendEnvelope(
      data: GiftSendDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$GiftSendEnvelopeToJson(GiftSendEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
