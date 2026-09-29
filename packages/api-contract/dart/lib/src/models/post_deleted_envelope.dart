// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_deleted_dto.dart';
import 'response_meta_dto.dart';

part 'post_deleted_envelope.g.dart';

@JsonSerializable()
class PostDeletedEnvelope {
  const PostDeletedEnvelope({required this.data, this.meta});

  factory PostDeletedEnvelope.fromJson(Map<String, Object?> json) =>
      _$PostDeletedEnvelopeFromJson(json);

  final PostDeletedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PostDeletedEnvelopeToJson(this);
}
