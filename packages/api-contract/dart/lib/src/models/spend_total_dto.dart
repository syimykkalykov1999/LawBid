// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'spend_total_dto.g.dart';

@JsonSerializable()
class SpendTotalDto {
  const SpendTotalDto({
    required this.monthToDateUsd,
    required this.forecastUsd,
    required this.marginPercent,
    required this.keepOnAccountUsd,
    required this.fixedMonthUsd,
    required this.stripeFeesUsd,
  });

  factory SpendTotalDto.fromJson(Map<String, Object?> json) =>
      _$SpendTotalDtoFromJson(json);

  final num monthToDateUsd;
  final num forecastUsd;
  final num marginPercent;
  final num keepOnAccountUsd;
  final num fixedMonthUsd;
  final num? stripeFeesUsd;

  Map<String, Object?> toJson() => _$SpendTotalDtoToJson(this);
}
