// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reorder_sticker_packs_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReorderStickerPacksDto _$ReorderStickerPacksDtoFromJson(
  Map<String, dynamic> json,
) => ReorderStickerPacksDto(
  packIds: (json['packIds'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ReorderStickerPacksDtoToJson(
  ReorderStickerPacksDto instance,
) => <String, dynamic>{'packIds': instance.packIds};
