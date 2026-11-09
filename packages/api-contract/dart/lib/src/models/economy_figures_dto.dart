// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'spend_line_dto.dart';

part 'economy_figures_dto.g.dart';

@JsonSerializable()
class EconomyFiguresDto {
  const EconomyFiguresDto({
    required this.revenue30dUsd,
    required this.revenueMonthUsd,
    required this.allowedUsd,
    required this.lines,
    required this.monthToDateUsd,
    required this.projectedUsd,
    required this.thirdPartyMonthToDateUsd,
    required this.thirdPartyProjectedUsd,
    required this.awsMonthToDateUsd,
    required this.awsProjectedUsd,
    required this.awsLimitUsd,
  });

  factory EconomyFiguresDto.fromJson(Map<String, Object?> json) =>
      _$EconomyFiguresDtoFromJson(json);

  final num revenue30dUsd;
  final num revenueMonthUsd;

  /// Spend the rule allows this month, USD.
  final num allowedUsd;
  final List<SpendLineDto> lines;
  final num monthToDateUsd;

  /// Projected spend for the month, both brakes together (third-party + AWS).
  final num projectedUsd;

  /// Third-party brake: metered external services (SMS, Bunny video, translation, ID checks, Cloudflare) spent so far this month.
  final num thirdPartyMonthToDateUsd;

  /// Third-party brake: projected for the month; compared with allowedUsd.
  final num thirdPartyProjectedUsd;

  /// AWS brake: the AWS bill (SES, Rekognition included) so far.
  final num awsMonthToDateUsd;

  /// AWS brake: projected AWS bill; compared with awsLimitUsd.
  final num awsProjectedUsd;

  /// The AWS budget (AWS Budgets); allowedUsd when it cannot be read.
  final num awsLimitUsd;

  Map<String, Object?> toJson() => _$EconomyFiguresDtoToJson(this);
}
