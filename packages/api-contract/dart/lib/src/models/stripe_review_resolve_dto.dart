// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stripe_review_resolve_dto.g.dart';

@JsonSerializable()
class StripeReviewResolveDto {
  const StripeReviewResolveDto({required this.resolution});

  factory StripeReviewResolveDto.fromJson(Map<String, Object?> json) =>
      _$StripeReviewResolveDtoFromJson(json);

  final String resolution;

  Map<String, Object?> toJson() => _$StripeReviewResolveDtoToJson(this);
}
