// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_partner_stats_dto.dart';

part 'outreach_stats_dto.g.dart';

@JsonSerializable()
class OutreachStatsDto {
  const OutreachStatsDto({
    required this.from,
    required this.to,
    required this.partners,
    required this.totals,
    required this.byStatus,
  });

  factory OutreachStatsDto.fromJson(Map<String, Object?> json) =>
      _$OutreachStatsDtoFromJson(json);

  final DateTime from;
  final DateTime to;
  final List<OutreachPartnerStatsDto> partners;
  final OutreachPartnerStatsDto totals;

  /// Leads by status, all time.
  final Map<String, num> byStatus;

  Map<String, Object?> toJson() => _$OutreachStatsDtoToJson(this);
}
