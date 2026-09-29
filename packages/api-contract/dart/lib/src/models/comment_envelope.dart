// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'comment_dto.dart';
import 'response_meta_dto.dart';

part 'comment_envelope.g.dart';

@JsonSerializable()
class CommentEnvelope {
  const CommentEnvelope({required this.data, this.meta});

  factory CommentEnvelope.fromJson(Map<String, Object?> json) =>
      _$CommentEnvelopeFromJson(json);

  final CommentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CommentEnvelopeToJson(this);
}
