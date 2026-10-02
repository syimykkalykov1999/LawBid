// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_pack_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerPackListEnvelope _$StickerPackListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StickerPackListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StickerPackDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StickerPackListEnvelopeToJson(
  StickerPackListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
