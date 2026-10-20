// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_deadline_rule_dto_day_type.dart';
import 'update_deadline_rule_dto_direction.dart';
import 'update_deadline_rule_dto_kind.dart';
import 'update_deadline_rule_dto_unit.dart';

part 'update_deadline_rule_dto.g.dart';

@JsonSerializable()
class UpdateDeadlineRuleDto {
  const UpdateDeadlineRuleDto({
    this.kind,
    this.labels,
    this.amount,
    this.unit,
    this.dayType,
    this.direction,
    this.practiceCode,
    this.citation,
    this.notes,
    this.sourceUrl,
    this.verified,
    this.isActive,
    this.sort,
  });

  factory UpdateDeadlineRuleDto.fromJson(Map<String, Object?> json) =>
      _$UpdateDeadlineRuleDtoFromJson(json);

  final UpdateDeadlineRuleDtoKind? kind;
  final Map<String, String>? labels;
  final int? amount;
  final UpdateDeadlineRuleDtoUnit? unit;
  final UpdateDeadlineRuleDtoDayType? dayType;
  final UpdateDeadlineRuleDtoDirection? direction;
  final String? practiceCode;
  final String? citation;
  final Map<String, String>? notes;
  final String? sourceUrl;
  final bool? verified;
  final bool? isActive;
  final int? sort;

  Map<String, Object?> toJson() => _$UpdateDeadlineRuleDtoToJson(this);
}
