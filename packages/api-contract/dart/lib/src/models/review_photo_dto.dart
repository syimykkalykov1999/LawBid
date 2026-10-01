// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_photo_dto.g.dart';

@JsonSerializable()
class ReviewPhotoDto {
  const ReviewPhotoDto({
    required this.fileId,
    required this.url,
    required this.previewUrl,
  });

  factory ReviewPhotoDto.fromJson(Map<String, Object?> json) =>
      _$ReviewPhotoDtoFromJson(json);

  final String fileId;
  final String url;
  final String previewUrl;

  Map<String, Object?> toJson() => _$ReviewPhotoDtoToJson(this);
}
