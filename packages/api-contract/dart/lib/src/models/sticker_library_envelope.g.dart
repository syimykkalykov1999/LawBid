// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_library_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerLibraryEnvelope _$StickerLibraryEnvelopeFromJson(
  Map<String, dynamic> json,
) => StickerLibraryEnvelope(
  data: StickerLibraryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StickerLibraryEnvelopeToJson(
  StickerLibraryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
