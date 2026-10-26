// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dashboard_role_totals_dto.dart';

part 'dashboard_totals_dto.g.dart';

@JsonSerializable()
class DashboardTotalsDto {
  const DashboardTotalsDto({
    required this.clients,
    required this.attorneys,
    required this.assistants,
    required this.admins,
    required this.all,
    required this.computedAt,
  });

  factory DashboardTotalsDto.fromJson(Map<String, Object?> json) =>
      _$DashboardTotalsDtoFromJson(json);

  final DashboardRoleTotalsDto clients;
  final DashboardRoleTotalsDto attorneys;

  /// Assistant seats (assistant_memberships): total = invited + active, active = joined.
  final DashboardRoleTotalsDto assistants;
  final DashboardRoleTotalsDto admins;

  /// Clients + attorneys + admins + assistants.
  final DashboardRoleTotalsDto all;

  /// When these totals were counted (daily or by the admin button).
  final DateTime computedAt;

  Map<String, Object?> toJson() => _$DashboardTotalsDtoToJson(this);
}
