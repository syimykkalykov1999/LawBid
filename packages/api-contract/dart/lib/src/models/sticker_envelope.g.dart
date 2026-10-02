// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerEnvelope _$StickerEnvelopeFromJson(Map<String, dynamic> json) =>
    StickerEnvelope(
      data: StickerDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StickerEnvelopeToJson(StickerEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
