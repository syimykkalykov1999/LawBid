// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_promotion_row_dto.dart';

part 'admin_promotion_action_result_dto.g.dart';

@JsonSerializable()
class AdminPromotionActionResultDto {
  const AdminPromotionActionResultDto({required this.promotion, this.note});

  factory AdminPromotionActionResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminPromotionActionResultDtoFromJson(json);

  final AdminPromotionRowDto promotion;

  /// E.g. "refund from the Payments screen" for a paid one.
  final String? note;

  Map<String, Object?> toJson() => _$AdminPromotionActionResultDtoToJson(this);
}
