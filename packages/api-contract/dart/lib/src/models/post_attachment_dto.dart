// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_attachment_dto.g.dart';

@JsonSerializable()
class PostAttachmentDto {
  const PostAttachmentDto({
    required this.fileId,
    required this.position,
    required this.fileName,
    required this.mime,
    required this.sizeBytes,
    required this.url,
  });

  factory PostAttachmentDto.fromJson(Map<String, Object?> json) =>
      _$PostAttachmentDtoFromJson(json);

  final String fileId;
  final int position;
  final String fileName;
  final String mime;
  final int sizeBytes;

  /// Signed download link (1 hour).
  final String url;

  Map<String, Object?> toJson() => _$PostAttachmentDtoToJson(this);
}
