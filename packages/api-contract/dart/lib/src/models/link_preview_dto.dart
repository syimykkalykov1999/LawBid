// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'link_preview_dto.g.dart';

@JsonSerializable()
class LinkPreviewDto {
  const LinkPreviewDto({
    required this.url,
    required this.title,
    required this.description,
    required this.imageUrl,
    required this.siteName,
  });

  factory LinkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$LinkPreviewDtoFromJson(json);

  final String url;
  final String? title;
  final String? description;
  final String? imageUrl;
  final String? siteName;

  Map<String, Object?> toJson() => _$LinkPreviewDtoToJson(this);
}
