// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_user_dto.dart';
import 'partner_commission_kind.dart';
import 'partner_commission_status.dart';

part 'admin_partner_commission_row_dto.g.dart';

@JsonSerializable()
class AdminPartnerCommissionRowDto {
  const AdminPartnerCommissionRowDto({
    required this.id,
    required this.kind,
    required this.amountCents,
    required this.status,
    required this.period,
    required this.createdAt,
    required this.partnerId,
    required this.partner,
    required this.eventRef,
    this.referredUserId,
    this.holdUntil,
    this.approvedAt,
    this.paidAt,
    this.payoutRef,
    this.reversedAt,
    this.reversedReason,
    this.note,
    this.referredUser,
  });

  factory AdminPartnerCommissionRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerCommissionRowDtoFromJson(json);

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
  final String partnerId;
  final AdminPartnerUserDto partner;
  final AdminPartnerUserDto? referredUser;
  final String eventRef;

  Map<String, Object?> toJson() => _$AdminPartnerCommissionRowDtoToJson(this);
}
