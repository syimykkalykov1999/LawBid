// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'comment_deleted_dto.dart';
import 'response_meta_dto.dart';

part 'comment_deleted_envelope.g.dart';

@JsonSerializable()
class CommentDeletedEnvelope {
  const CommentDeletedEnvelope({required this.data, this.meta});

  factory CommentDeletedEnvelope.fromJson(Map<String, Object?> json) =>
      _$CommentDeletedEnvelopeFromJson(json);

  final CommentDeletedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CommentDeletedEnvelopeToJson(this);
}
