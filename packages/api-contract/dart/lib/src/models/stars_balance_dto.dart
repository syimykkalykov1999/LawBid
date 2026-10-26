// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stars_balance_dto.g.dart';

@JsonSerializable()
class StarsBalanceDto {
  const StarsBalanceDto({required this.balance});

  factory StarsBalanceDto.fromJson(Map<String, Object?> json) =>
      _$StarsBalanceDtoFromJson(json);

  final int balance;

  Map<String, Object?> toJson() => _$StarsBalanceDtoToJson(this);
}
