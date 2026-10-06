// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_external_dto.dart';
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
    required this.demoAccess,
    required this.externalValue,
    this.label,
    this.note,
    this.attorneyRateCents,
    this.clientRateCents,
    this.clientRule,
    this.holdDays,
    this.endedAt,
    this.termsAcceptedAt,
    this.termsVersion,
    this.w9ReceivedAt,
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

  /// When the partner accepted the rules in the app.
  final DateTime? termsAcceptedAt;
  final String? termsVersion;

  /// W-9 (or W-8) received; null blocks payouts while requireW9 is on.
  final DateTime? w9ReceivedAt;

  /// Owner 2026-10-05 («Продвижение»): may create demo accounts.
  final bool demoAccess;

  /// The name has been replaced because it contains a keyword. Original name: `external`.
  /// The name has been replaced because it contains a keyword. Original name: `external`.
  /// The name has been replaced because it contains a keyword. Original name: `external`.
  @JsonKey(name: 'external')
  final AdminPartnerExternalDto? externalValue;

  Map<String, Object?> toJson() => _$AdminPartnerRowDtoToJson(this);
}
