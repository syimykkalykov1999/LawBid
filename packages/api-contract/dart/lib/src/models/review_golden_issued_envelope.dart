// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_golden_issued_dto.dart';

part 'review_golden_issued_envelope.g.dart';

@JsonSerializable()
class ReviewGoldenIssuedEnvelope {
  const ReviewGoldenIssuedEnvelope({required this.data, this.meta});

  factory ReviewGoldenIssuedEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewGoldenIssuedEnvelopeFromJson(json);

  final ReviewGoldenIssuedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewGoldenIssuedEnvelopeToJson(this);
}
