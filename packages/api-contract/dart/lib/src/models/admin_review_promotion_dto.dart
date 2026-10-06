// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_review_promotion_dto_decision.dart';

part 'admin_review_promotion_dto.g.dart';

@JsonSerializable()
class AdminReviewPromotionDto {
  const AdminReviewPromotionDto({required this.decision, this.reason = ''});

  factory AdminReviewPromotionDto.fromJson(Map<String, Object?> json) =>
      _$AdminReviewPromotionDtoFromJson(json);

  final AdminReviewPromotionDtoDecision decision;
  final String reason;

  Map<String, Object?> toJson() => _$AdminReviewPromotionDtoToJson(this);
}
