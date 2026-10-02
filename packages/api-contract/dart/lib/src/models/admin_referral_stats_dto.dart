// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_count_dto.dart';

part 'admin_referral_stats_dto.g.dart';

@JsonSerializable()
class AdminReferralStatsDto {
  const AdminReferralStatsDto({
    required this.total,
    required this.byStatus,
    required this.byRole,
    required this.balanceCentsIssued,
    required this.promotionDaysIssued,
    required this.promotionDaysUsed,
  });

  factory AdminReferralStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminReferralStatsDtoFromJson(json);

  final int total;
  final List<ReferralCountDto> byStatus;

  /// Referee's role.
  final List<ReferralCountDto> byRole;

  /// Credit issued, cents.
  final int balanceCentsIssued;

  /// Promotion days issued.
  final int promotionDaysIssued;

  /// Promotion days spent.
  final int promotionDaysUsed;

  Map<String, Object?> toJson() => _$AdminReferralStatsDtoToJson(this);
}
