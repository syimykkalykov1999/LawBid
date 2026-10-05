// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_user_dto.dart';
import 'partner_client_rule.dart';
import 'partner_rates_dto.dart';
import 'partner_status.dart';
import 'partner_totals_dto.dart';

part 'admin_partner_row_dto.g.dart';

@JsonSerializable()
class AdminPartnerRowDto {
  const AdminPartnerRowDto({
    required this.id,
    required this.user,
    required this.status,
    required this.code,
    required this.shareUrl,
    required this.rates,
    required this.totals,
    required this.createdAt,
    this.label,
    this.note,
    this.attorneyRateCents,
    this.clientRateCents,
    this.clientRule,
    this.holdDays,
    this.endedAt,
  });

  factory AdminPartnerRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerRowDtoFromJson(json);

  final String id;
  final AdminPartnerUserDto user;
  final PartnerStatus status;
  final String? label;
  final String? note;
  final String code;
  final String shareUrl;

  /// Effective (own or default).
  final PartnerRatesDto rates;

  /// Own override; null = default.
  final int? attorneyRateCents;
  final int? clientRateCents;
  final PartnerClientRule? clientRule;
  final int? holdDays;
  final PartnerTotalsDto totals;
  final DateTime createdAt;
  final DateTime? endedAt;

  Map<String, Object?> toJson() => _$AdminPartnerRowDtoToJson(this);
}
