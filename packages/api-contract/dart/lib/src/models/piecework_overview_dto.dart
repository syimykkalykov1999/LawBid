// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_overview_dto_scope.dart';
import 'piecework_person_dto.dart';
import 'piecework_totals_dto.dart';

part 'piecework_overview_dto.g.dart';

@JsonSerializable()
class PieceworkOverviewDto {
  const PieceworkOverviewDto({
    required this.period,
    required this.scope,
    required this.currency,
    required this.totals,
    required this.people,
  });

  factory PieceworkOverviewDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkOverviewDtoFromJson(json);

  final String period;
  final PieceworkOverviewDtoScope scope;
  final String currency;
  final PieceworkTotalsDto totals;
  final List<PieceworkPersonDto> people;

  Map<String, Object?> toJson() => _$PieceworkOverviewDtoToJson(this);
}
