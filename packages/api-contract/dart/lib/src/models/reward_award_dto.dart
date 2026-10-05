// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reward_award_dto_department.dart';

part 'reward_award_dto.g.dart';

@JsonSerializable()
class RewardAwardDto {
  const RewardAwardDto({
    required this.id,
    required this.period,
    required this.department,
    required this.adminId,
    required this.name,
    required this.rank,
    required this.score,
    required this.prize,
    required this.bonusCents,
    required this.currency,
    required this.onPayroll,
    required this.auto,
    required this.createdAt,
  });

  factory RewardAwardDto.fromJson(Map<String, Object?> json) =>
      _$RewardAwardDtoFromJson(json);

  final String id;
  final String period;
  final RewardAwardDtoDepartment department;
  final String adminId;
  final String name;
  final num rank;
  final num score;
  final String prize;
  final num bonusCents;
  final String currency;

  /// The bonus is on payroll (Деньги → Зарплаты).
  final bool onPayroll;
  final bool auto;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$RewardAwardDtoToJson(this);
}
