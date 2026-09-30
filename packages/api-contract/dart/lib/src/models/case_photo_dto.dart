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
  });

  factory CasePhotoDto.fromJson(Map<String, Object?> json) =>
      _$CasePhotoDtoFromJson(json);

  final String fileId;
  final String url;

  /// 320 px preview.
  final String previewUrl;

  Map<String, Object?> toJson() => _$CasePhotoDtoToJson(this);
}
