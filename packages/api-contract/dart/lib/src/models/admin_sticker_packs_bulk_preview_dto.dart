// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_packs_filter_dto.dart';

part 'admin_sticker_packs_bulk_preview_dto.g.dart';

@JsonSerializable()
class AdminStickerPacksBulkPreviewDto {
  const AdminStickerPacksBulkPreviewDto({required this.filter});

  factory AdminStickerPacksBulkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPacksBulkPreviewDtoFromJson(json);

  final AdminStickerPacksFilterDto filter;

  Map<String, Object?> toJson() =>
      _$AdminStickerPacksBulkPreviewDtoToJson(this);
}
