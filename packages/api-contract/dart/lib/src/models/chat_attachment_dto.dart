// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'chat_attachment_dto.g.dart';

@JsonSerializable()
class ChatAttachmentDto {
  const ChatAttachmentDto({
    required this.fileId,
    required this.name,
    required this.isImage,
    this.mime,
    this.sizeBytes,
    this.url,
    this.previewUrl,
    this.width,
    this.height,
  });

  factory ChatAttachmentDto.fromJson(Map<String, Object?> json) =>
      _$ChatAttachmentDtoFromJson(json);

  final String fileId;
  final String name;

  /// Null while the antivirus scan runs.
  final String? mime;
  final int? sizeBytes;
  final bool isImage;

  /// Short signed link; null until scanned / in list previews.
  final String? url;
  final String? previewUrl;
  final int? width;
  final int? height;

  Map<String, Object?> toJson() => _$ChatAttachmentDtoToJson(this);
}
