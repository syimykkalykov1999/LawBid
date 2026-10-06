// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_goal_view_dto.dart';
import 'country_partner_month_dto.dart';
import 'country_partner_settlement_dto.dart';
import 'country_partner_status.dart';
import 'country_partner_team_member_dto.dart';

part 'country_partner_detail_dto.g.dart';

@JsonSerializable()
class CountryPartnerDetailDto {
  const CountryPartnerDetailDto({
    required this.id,
    required this.countryCode,
    required this.countryName,
    required this.name,
    required this.contact,
    required this.leadAdminId,
    required this.leadEmail,
    required this.sharePercent,
    required this.status,
    required this.maxAdmins,
    required this.teamSize,
    required this.payoutsEnabled,
    required this.contractStartsAt,
    required this.contractEndsAt,
    required this.contractVersion,
    required this.contractAcceptedAt,
    required this.note,
    required this.createdAt,
    required this.goals,
    required this.team,
    required this.settlements,
    required this.currentMonth,
  });

  factory CountryPartnerDetailDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerDetailDtoFromJson(json);

  final String id;
  final String countryCode;
  final String countryName;
  final String name;
  final String? contact;
  final String leadAdminId;
  final String leadEmail;
  final num sharePercent;
  final CountryPartnerStatus status;
  final int maxAdmins;
  final int teamSize;
  final bool payoutsEnabled;
  final DateTime? contractStartsAt;
  final DateTime? contractEndsAt;
  final int? contractVersion;
  final DateTime? contractAcceptedAt;
  final String? note;
  final DateTime createdAt;
  final List<CountryPartnerGoalViewDto> goals;
  final List<CountryPartnerTeamMemberDto> team;
  final List<CountryPartnerSettlementDto> settlements;

  /// This month so far.
  final List<CountryPartnerMonthDto> currentMonth;

  Map<String, Object?> toJson() => _$CountryPartnerDetailDtoToJson(this);
}
