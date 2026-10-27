// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_current_dto.dart';

part 'review_current_envelope.g.dart';

@JsonSerializable()
class ReviewCurrentEnvelope {
  const ReviewCurrentEnvelope({required this.data, this.meta});

  factory ReviewCurrentEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewCurrentEnvelopeFromJson(json);

  final ReviewCurrentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewCurrentEnvelopeToJson(this);
}
