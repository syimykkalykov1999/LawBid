// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_packs_bulk_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPacksBulkPreviewDto _$AdminStickerPacksBulkPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminStickerPacksBulkPreviewDto(
  filter: AdminStickerPacksFilterDto.fromJson(
    json['filter'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$AdminStickerPacksBulkPreviewDtoToJson(
  AdminStickerPacksBulkPreviewDto instance,
) => <String, dynamic>{'filter': instance.filter.toJson()};
