// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stripe_review_item_dto.dart';

part 'stripe_review_item_envelope.g.dart';

@JsonSerializable()
class StripeReviewItemEnvelope {
  const StripeReviewItemEnvelope({required this.data, this.meta});

  factory StripeReviewItemEnvelope.fromJson(Map<String, Object?> json) =>
      _$StripeReviewItemEnvelopeFromJson(json);

  final StripeReviewItemDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StripeReviewItemEnvelopeToJson(this);
}
