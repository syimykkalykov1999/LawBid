// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_promotion_dto.dart';
import 'promotion_quote_dto.dart';

part 'case_promotion_state_dto.g.dart';

@JsonSerializable()
class CasePromotionStateDto {
  const CasePromotionStateDto({
    required this.canPromote,
    required this.quote,
    this.promotion,
  });

  factory CasePromotionStateDto.fromJson(Map<String, Object?> json) =>
      _$CasePromotionStateDtoFromJson(json);

  /// Active / pending one, else the latest.
  final CasePromotionDto? promotion;

  /// The case can be promoted now.
  final bool canPromote;

  /// Quote for 1 day.
  final PromotionQuoteDto quote;

  Map<String, Object?> toJson() => _$CasePromotionStateDtoToJson(this);
}
