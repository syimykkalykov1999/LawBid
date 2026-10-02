// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_pack_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerPackEnvelope _$StickerPackEnvelopeFromJson(Map<String, dynamic> json) =>
    StickerPackEnvelope(
      data: StickerPackDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StickerPackEnvelopeToJson(
  StickerPackEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
