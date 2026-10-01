// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_review_dto.dart';
import 'response_meta_dto.dart';

part 'public_review_envelope.g.dart';

@JsonSerializable()
class PublicReviewEnvelope {
  const PublicReviewEnvelope({required this.data, this.meta});

  factory PublicReviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicReviewEnvelopeFromJson(json);

  final PublicReviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicReviewEnvelopeToJson(this);
}
