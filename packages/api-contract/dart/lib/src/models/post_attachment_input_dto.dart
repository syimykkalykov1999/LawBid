// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_attachment_input_dto.g.dart';

@JsonSerializable()
class PostAttachmentInputDto {
  const PostAttachmentInputDto({required this.fileId, required this.fileName});

  factory PostAttachmentInputDto.fromJson(Map<String, Object?> json) =>
      _$PostAttachmentInputDtoFromJson(json);

  /// A clean post_attachment file.
  final String fileId;

  /// The name readers see and download (e.g. "Lease.pdf").
  final String fileName;

  Map<String, Object?> toJson() => _$PostAttachmentInputDtoToJson(this);
}
