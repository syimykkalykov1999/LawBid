// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_attachments_mode_dto.dart';
import 'response_meta_dto.dart';

part 'post_attachments_mode_envelope.g.dart';

@JsonSerializable()
class PostAttachmentsModeEnvelope {
  const PostAttachmentsModeEnvelope({required this.data, this.meta});

  factory PostAttachmentsModeEnvelope.fromJson(Map<String, Object?> json) =>
      _$PostAttachmentsModeEnvelopeFromJson(json);

  final PostAttachmentsModeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PostAttachmentsModeEnvelopeToJson(this);
}
