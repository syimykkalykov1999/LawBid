// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_refund_mode.dart';

part 'admin_cancel_promotion_dto.g.dart';

@JsonSerializable()
class AdminCancelPromotionDto {
  const AdminCancelPromotionDto({
    this.reason = '',
    this.refund = PromotionRefundMode.none,
  });

  factory AdminCancelPromotionDto.fromJson(Map<String, Object?> json) =>
      _$AdminCancelPromotionDtoFromJson(json);

  final String reason;

  /// Owner 2026-10-05: give money back right away.
  final PromotionRefundMode refund;

  Map<String, Object?> toJson() => _$AdminCancelPromotionDtoToJson(this);
}
