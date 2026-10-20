// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deadline_day_type.dart';
import 'deadline_direction.dart';
import 'deadline_kind.dart';
import 'deadline_unit.dart';

part 'deadline_rule_dto.g.dart';

@JsonSerializable()
class DeadlineRuleDto {
  const DeadlineRuleDto({
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
    this.practiceCode,
    this.citation,
    this.notes,
    this.sourceUrl,
  });

  factory DeadlineRuleDto.fromJson(Map<String, Object?> json) =>
      _$DeadlineRuleDtoFromJson(json);

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

  Map<String, Object?> toJson() => _$DeadlineRuleDtoToJson(this);
}
