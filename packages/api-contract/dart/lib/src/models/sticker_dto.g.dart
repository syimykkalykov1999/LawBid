// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerDto _$StickerDtoFromJson(Map<String, dynamic> json) => StickerDto(
  id: json['id'] as String,
  packId: json['packId'] as String,
  emoji: json['emoji'] as String,
  url: json['url'] as String?,
);

Map<String, dynamic> _$StickerDtoToJson(StickerDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'packId': instance.packId,
      'emoji': instance.emoji,
      'url': ?instance.url,
    };
