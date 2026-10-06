// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'treasury_bank_dto.g.dart';

@JsonSerializable()
class TreasuryBankDto {
  const TreasuryBankDto({
    required this.id,
    required this.label,
    required this.last4,
    required this.isDefault,
  });

  factory TreasuryBankDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryBankDtoFromJson(json);

  final String id;
  final String label;
  final String last4;

  /// Stripe's default bank for USD payouts.
  final bool isDefault;

  Map<String, Object?> toJson() => _$TreasuryBankDtoToJson(this);
}
