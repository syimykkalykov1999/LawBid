// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_dto.dart';

part 'review_envelope.g.dart';

@JsonSerializable()
class ReviewEnvelope {
  const ReviewEnvelope({required this.data, this.meta});

  factory ReviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewEnvelopeFromJson(json);

  final ReviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewEnvelopeToJson(this);
}
