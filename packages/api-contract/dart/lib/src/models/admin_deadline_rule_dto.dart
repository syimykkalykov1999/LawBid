// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deadline_day_type.dart';
import 'deadline_direction.dart';
import 'deadline_kind.dart';
import 'deadline_unit.dart';

part 'admin_deadline_rule_dto.g.dart';

@JsonSerializable()
class AdminDeadlineRuleDto {
  const AdminDeadlineRuleDto({
    required this.id,
    required this.jurisdiction,
    required this.kind,
    required this.code,
    required this.labels,
    required this.amount,
    required this.unit,
    required this.dayType,
    required this.direction,
    required this.verified,
    required this.isActive,
    required this.sort,
    this.practiceCode,
    this.citation,
    this.notes,
    this.sourceUrl,
  });

  factory AdminDeadlineRuleDto.fromJson(Map<String, Object?> json) =>
      _$AdminDeadlineRuleDtoFromJson(json);

  final String id;

  /// US = federal courts; otherwise a state code.
  final String jurisdiction;
  final DeadlineKind kind;
  final String code;
  final Map<String, String> labels;
  final int amount;
  final DeadlineUnit unit;
  final DeadlineDayType dayType;
  final DeadlineDirection direction;
  final String? practiceCode;
  final String? citation;
  final Map<String, String>? notes;
  final String? sourceUrl;

  /// Checked against the source by staff.
  final bool verified;
  final bool isActive;
  final int sort;

  Map<String, Object?> toJson() => _$AdminDeadlineRuleDtoToJson(this);
}
