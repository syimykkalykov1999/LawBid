// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'template_download_dto.g.dart';

@JsonSerializable()
class TemplateDownloadDto {
  const TemplateDownloadDto({
    required this.url,
    required this.fileName,
    required this.mime,
    required this.sizeBytes,
  });

  factory TemplateDownloadDto.fromJson(Map<String, Object?> json) =>
      _$TemplateDownloadDtoFromJson(json);

  /// Short-lived signed link (saves as fileName).
  final String url;
  final String fileName;
  final String mime;
  final num sizeBytes;

  Map<String, Object?> toJson() => _$TemplateDownloadDtoToJson(this);
}
