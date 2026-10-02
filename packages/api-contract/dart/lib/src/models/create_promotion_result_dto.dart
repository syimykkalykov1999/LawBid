// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_promotion_dto.dart';
import 'case_promotion_status.dart';

part 'create_promotion_result_dto.g.dart';

@JsonSerializable()
class CreatePromotionResultDto {
  const CreatePromotionResultDto({
    required this.promotionId,
    required this.status,
    required this.totalCents,
    required this.creditDaysUsed,
    required this.promotion,
    this.checkoutUrl,
  });

  factory CreatePromotionResultDto.fromJson(Map<String, Object?> json) =>
      _$CreatePromotionResultDtoFromJson(json);

  final String promotionId;
  final CasePromotionStatus status;

  /// Open in the browser to pay; null when nothing to pay.
  final String? checkoutUrl;
  final int totalCents;
  final int creditDaysUsed;
  final CasePromotionDto promotion;

  Map<String, Object?> toJson() => _$CreatePromotionResultDtoToJson(this);
}
