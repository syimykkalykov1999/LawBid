// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_staff_rate_dto_kind.dart';
import 'set_staff_rate_dto_workspace.dart';

part 'set_staff_rate_dto.g.dart';

@JsonSerializable()
class SetStaffRateDto {
  const SetStaffRateDto({
    required this.kind,
    required this.workspace,
    required this.amountCents,
    this.validFrom,
    this.boostMult,
  });

  factory SetStaffRateDto.fromJson(Map<String, Object?> json) =>
      _$SetStaffRateDtoFromJson(json);

  final SetStaffRateDtoKind kind;
  final SetStaffRateDtoWorkspace workspace;
  final int amountCents;

  /// From when the rate counts (default now; never in the past).
  final DateTime? validFrom;

  /// Weekly quest multiplier (×1.20), capped by the setting.
  final num? boostMult;

  Map<String, Object?> toJson() => _$SetStaffRateDtoToJson(this);
}
