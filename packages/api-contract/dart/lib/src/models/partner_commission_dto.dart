// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_commission_kind.dart';
import 'partner_commission_status.dart';

part 'partner_commission_dto.g.dart';

@JsonSerializable()
class PartnerCommissionDto {
  const PartnerCommissionDto({
    required this.id,
    required this.kind,
    required this.amountCents,
    required this.status,
    required this.period,
    required this.createdAt,
    this.referredUserId,
    this.holdUntil,
    this.approvedAt,
    this.paidAt,
    this.payoutRef,
    this.reversedAt,
    this.reversedReason,
    this.note,
  });

  factory PartnerCommissionDto.fromJson(Map<String, Object?> json) =>
      _$PartnerCommissionDtoFromJson(json);

  final String id;
  final PartnerCommissionKind kind;

  /// Cents; negative = deduction.
  final int amountCents;
  final PartnerCommissionStatus status;

  /// Payroll period.
  final String period;
  final String? referredUserId;
  final DateTime? holdUntil;
  final DateTime? approvedAt;
  final DateTime? paidAt;
  final String? payoutRef;
  final DateTime? reversedAt;
  final String? reversedReason;
  final String? note;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$PartnerCommissionDtoToJson(this);
}
