// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_image_mime.dart';

part 'ai_image_upload_dto.g.dart';

@JsonSerializable()
class AiImageUploadDto {
  const AiImageUploadDto({
    required this.mime,
    required this.sizeBytes,
    required this.sha256,
  });

  factory AiImageUploadDto.fromJson(Map<String, Object?> json) =>
      _$AiImageUploadDtoFromJson(json);

  final AiImageMime mime;
  final num sizeBytes;

  /// Lowercase hex SHA-256 of the file.
  final String sha256;

  Map<String, Object?> toJson() => _$AiImageUploadDtoToJson(this);
}
