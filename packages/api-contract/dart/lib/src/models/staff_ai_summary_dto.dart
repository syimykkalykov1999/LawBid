// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_ai_summary_source.dart';

part 'staff_ai_summary_dto.g.dart';

@JsonSerializable()
class StaffAiSummaryDto {
  const StaffAiSummaryDto({
    required this.available,
    required this.source,
    required this.text,
    this.model,
    this.at,
  });

  factory StaffAiSummaryDto.fromJson(Map<String, Object?> json) =>
      _$StaffAiSummaryDtoFromJson(json);

  final bool available;
  final StaffAiSummarySource source;
  final String? text;
  final String? model;

  /// ISO time the AI text was written.
  final String? at;

  Map<String, Object?> toJson() => _$StaffAiSummaryDtoToJson(this);
}
