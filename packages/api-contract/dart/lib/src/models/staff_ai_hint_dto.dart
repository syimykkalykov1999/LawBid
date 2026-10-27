// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_ai_hint_unavailable.dart';

part 'staff_ai_hint_dto.g.dart';

@JsonSerializable()
class StaffAiHintDto {
  const StaffAiHintDto({
    required this.available,
    required this.cached,
    this.suggestion,
    this.reason,
    this.confidence,
    this.model,
    this.unavailable,
  });

  factory StaffAiHintDto.fromJson(Map<String, Object?> json) =>
      _$StaffAiHintDtoFromJson(json);

  /// false = no hint this time (slow, over budget, rate limited…): the desk shows none
  final bool available;

  /// Suggested decision, one of the choices of the queue kind.
  final String? suggestion;

  /// One short sentence in Russian.
  final String? reason;
  final num? confidence;

  /// Model that answered.
  final String? model;

  /// Served from the per-item cache.
  final bool cached;
  final StaffAiHintUnavailable? unavailable;

  Map<String, Object?> toJson() => _$StaffAiHintDtoToJson(this);
}
