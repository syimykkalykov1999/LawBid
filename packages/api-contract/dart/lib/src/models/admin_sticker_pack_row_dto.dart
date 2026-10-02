// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_pack_row_dto_status.dart';

part 'admin_sticker_pack_row_dto.g.dart';

@JsonSerializable()
class AdminStickerPackRowDto {
  const AdminStickerPackRowDto({
    required this.id,
    required this.title,
    required this.shortName,
    required this.isOfficial,
    required this.status,
    required this.stickerCount,
    required this.installCount,
    required this.createdAt,
    this.ownerId,
    this.ownerName,
  });

  factory AdminStickerPackRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPackRowDtoFromJson(json);

  final String id;
  final String title;
  final String shortName;
  final bool isOfficial;
  final AdminStickerPackRowDtoStatus status;
  final String? ownerId;
  final String? ownerName;
  final int stickerCount;
  final int installCount;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminStickerPackRowDtoToJson(this);
}
