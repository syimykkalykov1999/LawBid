// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_sticker_dto.g.dart';

@JsonSerializable()
class AdminStickerDto {
  const AdminStickerDto({
    required this.id,
    required this.fileId,
    required this.emoji,
    required this.position,
    this.url,
  });

  factory AdminStickerDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerDtoFromJson(json);

  final String id;
  final String fileId;
  final String emoji;
  final int position;

  /// Null while the image is being checked.
  final String? url;

  Map<String, Object?> toJson() => _$AdminStickerDtoToJson(this);
}
