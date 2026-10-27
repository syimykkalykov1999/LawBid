// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_calibration_dto.g.dart';

@JsonSerializable()
class ReviewCalibrationDto {
  const ReviewCalibrationDto({
    required this.decisionKind,
    required this.pairs,
    required this.agreementPct,
  });

  factory ReviewCalibrationDto.fromJson(Map<String, Object?> json) =>
      _$ReviewCalibrationDtoFromJson(json);

  final String decisionKind;

  /// Samples checked by two reviewers.
  final num pairs;

  /// Percent of pairs where both reviewers said the same.
  final num? agreementPct;

  Map<String, Object?> toJson() => _$ReviewCalibrationDtoToJson(this);
}
