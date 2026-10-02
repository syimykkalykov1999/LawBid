// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerPackDto _$StickerPackDtoFromJson(Map<String, dynamic> json) =>
    StickerPackDto(
      id: json['id'] as String,
      title: json['title'] as String,
      shortName: json['shortName'] as String,
      isOfficial: json['isOfficial'] as bool,
      isMine: json['isMine'] as bool,
      installed: json['installed'] as bool,
      stickerCount: (json['stickerCount'] as num).toInt(),
      installCount: (json['installCount'] as num).toInt(),
      stickers: (json['stickers'] as List<dynamic>)
          .map((e) => StickerDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StickerPackDtoToJson(StickerPackDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'shortName': instance.shortName,
      'isOfficial': instance.isOfficial,
      'isMine': instance.isMine,
      'installed': instance.installed,
      'stickerCount': instance.stickerCount,
      'installCount': instance.installCount,
      'stickers': instance.stickers.map((e) => e.toJson()).toList(),
    };
