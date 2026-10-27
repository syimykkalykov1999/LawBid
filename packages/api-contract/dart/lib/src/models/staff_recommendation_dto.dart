// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_recommendation_dto_advice.dart';

part 'staff_recommendation_dto.g.dart';

@JsonSerializable()
class StaffRecommendationDto {
  const StaffRecommendationDto({
    required this.advice,
    required this.adviceLabel,
    required this.actionLabel,
    required this.headline,
    required this.lines,
  });

  factory StaffRecommendationDto.fromJson(Map<String, Object?> json) =>
      _$StaffRecommendationDtoFromJson(json);

  final StaffRecommendationDtoAdvice advice;

  /// «Премировать» / «Обучить» / «Заменить».
  final String adviceLabel;

  /// What the button will do.
  final String actionLabel;
  final String headline;

  /// The proof, one number a line.
  final List<String> lines;

  Map<String, Object?> toJson() => _$StaffRecommendationDtoToJson(this);
}
