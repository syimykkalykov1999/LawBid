// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_contract_dto.dart';
import 'country_partner_goal_view_dto.dart';
import 'country_partner_month_dto.dart';
import 'country_partner_settlement_dto.dart';
import 'country_partner_status.dart';

part 'country_partner_portal_dto.g.dart';

@JsonSerializable()
class CountryPartnerPortalDto {
  const CountryPartnerPortalDto({
    required this.id,
    required this.countryCode,
    required this.countryName,
    required this.name,
    required this.status,
    required this.lead,
    required this.sharePercent,
    required this.maxAdmins,
    required this.teamSize,
    required this.payoutsEnabled,
    required this.contractEndsAt,
    required this.contractPending,
    required this.contract,
    required this.goals,
    required this.canSeeReport,
    required this.settlements,
    required this.currentMonth,
  });

  factory CountryPartnerPortalDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerPortalDtoFromJson(json);

  final String id;
  final String countryCode;
  final String countryName;
  final String name;
  final CountryPartnerStatus status;
  final bool lead;
  final num sharePercent;
  final int maxAdmins;
  final int teamSize;
  final bool payoutsEnabled;
  final DateTime? contractEndsAt;

  /// The lead must accept the current contract first.
  final bool contractPending;
  final CountryPartnerContractDto contract;
  final List<CountryPartnerGoalViewDto> goals;

  /// The money report is shown (lead or accountant).
  final bool canSeeReport;
  final List<CountryPartnerSettlementDto> settlements;
  final List<CountryPartnerMonthDto> currentMonth;

  Map<String, Object?> toJson() => _$CountryPartnerPortalDtoToJson(this);
}
