// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_attachments_allowed_dto.dart';
import 'response_meta_dto.dart';

part 'post_attachments_allowed_envelope.g.dart';

@JsonSerializable()
class PostAttachmentsAllowedEnvelope {
  const PostAttachmentsAllowedEnvelope({required this.data, this.meta});

  factory PostAttachmentsAllowedEnvelope.fromJson(Map<String, Object?> json) =>
      _$PostAttachmentsAllowedEnvelopeFromJson(json);

  final PostAttachmentsAllowedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PostAttachmentsAllowedEnvelopeToJson(this);
}
