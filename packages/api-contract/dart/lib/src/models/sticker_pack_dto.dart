// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sticker_dto.dart';

part 'sticker_pack_dto.g.dart';

@JsonSerializable()
class StickerPackDto {
  const StickerPackDto({
    required this.id,
    required this.title,
    required this.shortName,
    required this.isOfficial,
    required this.isMine,
    required this.installed,
    required this.stickerCount,
    required this.installCount,
    required this.stickers,
  });

  factory StickerPackDto.fromJson(Map<String, Object?> json) =>
      _$StickerPackDtoFromJson(json);

  final String id;
  final String title;

  /// Share name (lawbid.app/stickers/<shortName>).
  final String shortName;
  final bool isOfficial;

  /// The viewer made this pack (can add / remove stickers).
  final bool isMine;
  final bool installed;
  final int stickerCount;
  final int installCount;
  final List<StickerDto> stickers;

  Map<String, Object?> toJson() => _$StickerPackDtoToJson(this);
}
