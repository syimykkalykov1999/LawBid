// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_stats_dto.g.dart';

@JsonSerializable()
class AdminPartnerStatsDto {
  const AdminPartnerStatsDto({
    required this.partners,
    required this.active,
    required this.pending,
    required this.referredCount,
    required this.heldCents,
    required this.approvedCents,
    required this.paidCents,
    required this.thisMonthCents,
  });

  factory AdminPartnerStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerStatsDtoFromJson(json);

  final int partners;
  final int active;

  /// Requests waiting for the admin.
  final int pending;
  final int referredCount;
  final int heldCents;
  final int approvedCents;
  final int paidCents;
  final int thisMonthCents;

  Map<String, Object?> toJson() => _$AdminPartnerStatsDtoToJson(this);
}
