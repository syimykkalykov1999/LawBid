// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'support_attachment_dto.g.dart';

@JsonSerializable()
class SupportAttachmentDto {
  const SupportAttachmentDto({
    required this.id,
    required this.name,
    required this.mime,
    required this.sizeBytes,
    required this.isImage,
    required this.isVideo,
    this.url,
    this.previewUrl,
    this.width,
    this.height,
  });
  
  factory SupportAttachmentDto.fromJson(Map<String, Object?> json) => _$SupportAttachmentDtoFromJson(json);
  
  /// The file id.
  final String id;
  final String name;
  final String mime;
  final num sizeBytes;
  final bool isImage;
  final bool isVideo;

  /// Short-lived signed link; null while the file is not clean.
  final String? url;

  /// 320 px, photos only.
  final String? previewUrl;
  final num? width;
  final num? height;

  Map<String, Object?> toJson() => _$SupportAttachmentDtoToJson(this);
}
