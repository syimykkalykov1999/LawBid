// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sticker_dto.dart';
import 'sticker_pack_dto.dart';

part 'sticker_library_dto.g.dart';

@JsonSerializable()
class StickerLibraryDto {
  const StickerLibraryDto({required this.recent, required this.packs});

  factory StickerLibraryDto.fromJson(Map<String, Object?> json) =>
      _$StickerLibraryDtoFromJson(json);

  final List<StickerDto> recent;
  final List<StickerPackDto> packs;

  Map<String, Object?> toJson() => _$StickerLibraryDtoToJson(this);
}
