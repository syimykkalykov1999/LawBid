// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reorder_sticker_packs_dto.g.dart';

@JsonSerializable()
class ReorderStickerPacksDto {
  const ReorderStickerPacksDto({required this.packIds});

  factory ReorderStickerPacksDto.fromJson(Map<String, Object?> json) =>
      _$ReorderStickerPacksDtoFromJson(json);

  final List<String> packIds;

  Map<String, Object?> toJson() => _$ReorderStickerPacksDtoToJson(this);
}
