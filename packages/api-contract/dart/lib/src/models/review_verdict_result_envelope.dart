// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_verdict_result_dto.dart';

part 'review_verdict_result_envelope.g.dart';

@JsonSerializable()
class ReviewVerdictResultEnvelope {
  const ReviewVerdictResultEnvelope({required this.data, this.meta});

  factory ReviewVerdictResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewVerdictResultEnvelopeFromJson(json);

  final ReviewVerdictResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewVerdictResultEnvelopeToJson(this);
}
