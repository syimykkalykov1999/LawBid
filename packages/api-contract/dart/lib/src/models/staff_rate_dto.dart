// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_rate_dto_kind.dart';
import 'staff_rate_dto_workspace.dart';

part 'staff_rate_dto.g.dart';

@JsonSerializable()
class StaffRateDto {
  const StaffRateDto({
    required this.id,
    required this.kind,
    required this.workspace,
    required this.amountCents,
    required this.currency,
    required this.validFrom,
    required this.active,
    this.validTo,
    this.boostMult,
  });

  factory StaffRateDto.fromJson(Map<String, Object?> json) =>
      _$StaffRateDtoFromJson(json);

  final String id;
  final StaffRateDtoKind kind;
  final StaffRateDtoWorkspace workspace;
  final int amountCents;
  final String currency;
  final DateTime validFrom;
  final DateTime? validTo;
  final num? boostMult;

  /// In force right now.
  final bool active;

  Map<String, Object?> toJson() => _$StaffRateDtoToJson(this);
}
