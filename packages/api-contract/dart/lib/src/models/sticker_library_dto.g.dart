// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sticker_library_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StickerLibraryDto _$StickerLibraryDtoFromJson(Map<String, dynamic> json) =>
    StickerLibraryDto(
      recent: (json['recent'] as List<dynamic>)
          .map((e) => StickerDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      packs: (json['packs'] as List<dynamic>)
          .map((e) => StickerPackDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StickerLibraryDtoToJson(StickerLibraryDto instance) =>
    <String, dynamic>{
      'recent': instance.recent.map((e) => e.toJson()).toList(),
      'packs': instance.packs.map((e) => e.toJson()).toList(),
    };
