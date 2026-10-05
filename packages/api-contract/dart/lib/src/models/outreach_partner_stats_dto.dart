// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_partner_dto.dart';

part 'outreach_partner_stats_dto.g.dart';

@JsonSerializable()
class OutreachPartnerStatsDto {
  const OutreachPartnerStatsDto({
    required this.partner,
    required this.leads,
    required this.calls,
    required this.emails,
    required this.replied,
    required this.registered,
    required this.paid,
    required this.commissionCents,
    required this.lastActivityAt,
  });

  factory OutreachPartnerStatsDto.fromJson(Map<String, Object?> json) =>
      _$OutreachPartnerStatsDtoFromJson(json);

  /// null = unassigned leads.
  final OutreachPartnerDto? partner;

  /// Leads assigned (all time).
  final num leads;

  /// Calls logged in the period.
  final num calls;

  /// Emails sent in the period.
  final num emails;

  /// Leads that answered (interested/replied) in the period.
  final num replied;

  /// Leads that registered in the period.
  final num registered;

  /// Leads that paid / hired in the period.
  final num paid;

  /// Partner commissions accrued in the period (not reversed).
  final num commissionCents;
  final DateTime? lastActivityAt;

  Map<String, Object?> toJson() => _$OutreachPartnerStatsDtoToJson(this);
}
