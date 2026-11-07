// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bid_case_change_dto.g.dart';

@JsonSerializable()
class BidCaseChangeDto {
  const BidCaseChangeDto({
    required this.field,
    required this.oldValue,
    required this.newValue,
    required this.at,
  });

  factory BidCaseChangeDto.fromJson(Map<String, Object?> json) =>
      _$BidCaseChangeDtoFromJson(json);

  final String field;

  /// Text, or JSON for the budget.
  final String? oldValue;
  final String? newValue;
  final DateTime at;

  Map<String, Object?> toJson() => _$BidCaseChangeDtoToJson(this);
}
