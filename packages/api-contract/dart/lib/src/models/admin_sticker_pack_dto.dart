// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_dto.dart';
import 'admin_sticker_pack_dto_status.dart';

part 'admin_sticker_pack_dto.g.dart';

@JsonSerializable()
class AdminStickerPackDto {
  const AdminStickerPackDto({
    required this.id,
    required this.title,
    required this.shortName,
    required this.isOfficial,
    required this.status,
    required this.stickerCount,
    required this.installCount,
    required this.createdAt,
    required this.stickers,
    this.ownerId,
    this.ownerName,
  });

  factory AdminStickerPackDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPackDtoFromJson(json);

  final String id;
  final String title;
  final String shortName;
  final bool isOfficial;
  final AdminStickerPackDtoStatus status;
  final String? ownerId;
  final String? ownerName;
  final int stickerCount;
  final int installCount;
  final DateTime createdAt;
  final List<AdminStickerDto> stickers;

  Map<String, Object?> toJson() => _$AdminStickerPackDtoToJson(this);
}
