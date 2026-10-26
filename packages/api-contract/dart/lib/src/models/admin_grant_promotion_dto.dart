// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_target.dart';

part 'admin_grant_promotion_dto.g.dart';

@JsonSerializable()
class AdminGrantPromotionDto {
  const AdminGrantPromotionDto({
    required this.caseId,
    required this.days,
    this.dailyBudgetCents,
    this.target = PromotionTarget.valueCase,
    this.reason = '',
  });

  factory AdminGrantPromotionDto.fromJson(Map<String, Object?> json) =>
      _$AdminGrantPromotionDtoFromJson(json);

  final PromotionTarget target;

  /// Case id or post id.
  final String caseId;

  /// Daily budget it is worth (reach); default from settings.
  final int? dailyBudgetCents;
  final int days;
  final String reason;

  Map<String, Object?> toJson() => _$AdminGrantPromotionDtoToJson(this);
}
