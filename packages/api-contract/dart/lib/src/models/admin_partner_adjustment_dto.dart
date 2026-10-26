// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_adjustment_dto.g.dart';

@JsonSerializable()
class AdminPartnerAdjustmentDto {
  const AdminPartnerAdjustmentDto({
    required this.amountCents,
    required this.note,
    this.reason = '',
  });

  factory AdminPartnerAdjustmentDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerAdjustmentDtoFromJson(json);

  /// Cents; negative deducts (bonus, penalty, correction).
  final int amountCents;

  /// Shown to the partner.
  final String note;
  final String reason;

  Map<String, Object?> toJson() => _$AdminPartnerAdjustmentDtoToJson(this);
}
