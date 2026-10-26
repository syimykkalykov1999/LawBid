// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_upload_dto_mime.dart';

part 'admin_sticker_upload_dto.g.dart';

@JsonSerializable()
class AdminStickerUploadDto {
  const AdminStickerUploadDto({
    required this.mime,
    required this.sizeBytes,
    required this.sha256,
  });

  factory AdminStickerUploadDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerUploadDtoFromJson(json);

  final AdminStickerUploadDtoMime mime;

  /// Bytes; the `files.sticker_max_size_mb` setting applies.
  final num sizeBytes;
  final String sha256;

  Map<String, Object?> toJson() => _$AdminStickerUploadDtoToJson(this);
}
