// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_photo_dto.g.dart';

@JsonSerializable()
class CasePhotoDto {
  const CasePhotoDto({
    required this.fileId,
    required this.url,
    required this.previewUrl,
    required this.mime,
    required this.sizeBytes,
  });

  factory CasePhotoDto.fromJson(Map<String, Object?> json) =>
      _$CasePhotoDtoFromJson(json);

  final String fileId;
  final String url;

  /// 320 px preview (the file itself for documents).
  final String previewUrl;

  /// image/* or a document (application/pdf, Word) — OQ-034.
  final String mime;
  final int sizeBytes;

  Map<String, Object?> toJson() => _$CasePhotoDtoToJson(this);
}
