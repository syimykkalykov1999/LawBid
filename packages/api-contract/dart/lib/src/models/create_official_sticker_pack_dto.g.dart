// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_official_sticker_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateOfficialStickerPackDto _$CreateOfficialStickerPackDtoFromJson(
  Map<String, dynamic> json,
) => CreateOfficialStickerPackDto(
  title: json['title'] as String,
  shortName: json['shortName'] as String?,
);

Map<String, dynamic> _$CreateOfficialStickerPackDtoToJson(
  CreateOfficialStickerPackDto instance,
) => <String, dynamic>{
  'title': instance.title,
  'shortName': ?instance.shortName,
};
