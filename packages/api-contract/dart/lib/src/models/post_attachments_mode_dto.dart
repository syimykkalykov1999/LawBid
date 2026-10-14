// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_attachments_mode_dto_mode.dart';

part 'post_attachments_mode_dto.g.dart';

@JsonSerializable()
class PostAttachmentsModeDto {
  const PostAttachmentsModeDto({required this.mode, this.keepAfterCancel});

  factory PostAttachmentsModeDto.fromJson(Map<String, Object?> json) =>
      _$PostAttachmentsModeDtoFromJson(json);

  final PostAttachmentsModeDtoMode mode;
  final bool? keepAfterCancel;

  Map<String, Object?> toJson() => _$PostAttachmentsModeDtoToJson(this);
}
