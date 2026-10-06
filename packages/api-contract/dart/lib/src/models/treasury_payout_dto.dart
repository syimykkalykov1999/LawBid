// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'treasury_payout_dto_kind.dart';
import 'treasury_payout_dto_status.dart';
import 'treasury_payout_dto_trigger.dart';

part 'treasury_payout_dto.g.dart';

@JsonSerializable()
class TreasuryPayoutDto {
  const TreasuryPayoutDto({
    required this.id,
    required this.period,
    required this.kind,
    required this.trigger,
    required this.amountCents,
    required this.destinationLabel,
    required this.status,
    required this.failure,
    required this.createdAt,
  });

  factory TreasuryPayoutDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryPayoutDtoFromJson(json);

  final String id;
  final String period;
  final TreasuryPayoutDtoKind kind;
  final TreasuryPayoutDtoTrigger trigger;
  final int amountCents;
  final String? destinationLabel;
  final TreasuryPayoutDtoStatus status;
  final String? failure;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$TreasuryPayoutDtoToJson(this);
}
