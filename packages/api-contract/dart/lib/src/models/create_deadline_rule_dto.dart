// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_deadline_rule_dto_day_type.dart';
import 'create_deadline_rule_dto_direction.dart';
import 'create_deadline_rule_dto_kind.dart';
import 'create_deadline_rule_dto_unit.dart';

part 'create_deadline_rule_dto.g.dart';

@JsonSerializable()
class CreateDeadlineRuleDto {
  const CreateDeadlineRuleDto({
    required this.jurisdiction,
    required this.kind,
    required this.code,
    required this.labels,
    required this.amount,
    this.practiceCode,
    this.citation,
    this.notes,
    this.sourceUrl,
    this.verified,
    this.unit = CreateDeadlineRuleDtoUnit.day,
    this.dayType = CreateDeadlineRuleDtoDayType.calendar,
    this.direction = CreateDeadlineRuleDtoDirection.after,
    this.isActive = true,
    this.sort = 0,
  });

  factory CreateDeadlineRuleDto.fromJson(Map<String, Object?> json) =>
      _$CreateDeadlineRuleDtoFromJson(json);

  final String jurisdiction;
  final CreateDeadlineRuleDtoKind kind;
  final String code;
  final Map<String, String> labels;
  final int amount;
  final CreateDeadlineRuleDtoUnit unit;
  final CreateDeadlineRuleDtoDayType dayType;
  final CreateDeadlineRuleDtoDirection direction;
  final String? practiceCode;
  final String? citation;
  final Map<String, String>? notes;
  final String? sourceUrl;
  final bool? verified;
  final bool isActive;
  final int sort;

  Map<String, Object?> toJson() => _$CreateDeadlineRuleDtoToJson(this);
}
