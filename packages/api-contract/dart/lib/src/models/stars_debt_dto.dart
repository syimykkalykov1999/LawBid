// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stars_debt_dto.g.dart';

@JsonSerializable()
class StarsDebtDto {
  const StarsDebtDto({
    required this.userId,
    required this.debt,
    required this.balance,
  });
  
  factory StarsDebtDto.fromJson(Map<String, Object?> json) => _$StarsDebtDtoFromJson(json);
  
  final String userId;

  /// Stars still owed.
  final int debt;
  final int balance;

  Map<String, Object?> toJson() => _$StarsDebtDtoToJson(this);
}
