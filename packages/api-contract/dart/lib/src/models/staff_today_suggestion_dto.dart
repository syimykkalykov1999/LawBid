// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_recommendation_dto.dart';
import 'staff_today_suggestion_dto_workspace.dart';

part 'staff_today_suggestion_dto.g.dart';

@JsonSerializable()
class StaffTodaySuggestionDto {
  const StaffTodaySuggestionDto({
    required this.id,
    required this.adminId,
    required this.name,
    required this.workspace,
    required this.kind,
    required this.createdAt,
    required this.recommendation,
  });

  factory StaffTodaySuggestionDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodaySuggestionDtoFromJson(json);

  final String id;
  final String adminId;
  final String name;
  final StaffTodaySuggestionDtoWorkspace workspace;
  final String kind;
  final DateTime createdAt;
  final StaffRecommendationDto recommendation;

  Map<String, Object?> toJson() => _$StaffTodaySuggestionDtoToJson(this);
}
