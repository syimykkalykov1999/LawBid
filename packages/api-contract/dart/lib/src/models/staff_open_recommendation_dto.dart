// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_recommendation_dto.dart';

part 'staff_open_recommendation_dto.g.dart';

@JsonSerializable()
class StaffOpenRecommendationDto {
  const StaffOpenRecommendationDto({
    required this.suggestionId,
    required this.kind,
    required this.recommendation,
  });

  factory StaffOpenRecommendationDto.fromJson(Map<String, Object?> json) =>
      _$StaffOpenRecommendationDtoFromJson(json);

  final String suggestionId;
  final String kind;
  final StaffRecommendationDto recommendation;

  Map<String, Object?> toJson() => _$StaffOpenRecommendationDtoToJson(this);
}
