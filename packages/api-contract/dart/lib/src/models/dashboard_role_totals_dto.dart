// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dashboard_role_totals_dto.g.dart';

@JsonSerializable()
class DashboardRoleTotalsDto {
  const DashboardRoleTotalsDto({
    required this.total,
    required this.active,
    required this.verified,
  });

  factory DashboardRoleTotalsDto.fromJson(Map<String, Object?> json) =>
      _$DashboardRoleTotalsDtoFromJson(json);

  /// Accounts of this role, not deleted.
  final int total;

  /// Not suspended, not deleted.
  final int active;

  /// Attorneys: verified licence. Clients: approved verification. null where it does not apply.
  final int? verified;

  Map<String, Object?> toJson() => _$DashboardRoleTotalsDtoToJson(this);
}
