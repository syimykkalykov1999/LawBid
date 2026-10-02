// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_promotion_dto.g.dart';

@JsonSerializable()
class CreatePromotionDto {
  const CreatePromotionDto({
    required this.days,
    this.promoCode,
    this.useCredits = true,
  });

  factory CreatePromotionDto.fromJson(Map<String, Object?> json) =>
      _$CreatePromotionDtoFromJson(json);

  final int days;

  /// Spend free days earned through referrals first.
  final bool useCredits;
  final String? promoCode;

  Map<String, Object?> toJson() => _$CreatePromotionDtoToJson(this);
}
