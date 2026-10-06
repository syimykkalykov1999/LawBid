// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_suppression_dto.dart';

part 'outreach_suppressions_dto.g.dart';

@JsonSerializable()
class OutreachSuppressionsDto {
  const OutreachSuppressionsDto({required this.count, required this.latest});

  factory OutreachSuppressionsDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSuppressionsDtoFromJson(json);

  final num count;

  /// Newest ≤ 50.
  final List<OutreachSuppressionDto> latest;

  Map<String, Object?> toJson() => _$OutreachSuppressionsDtoToJson(this);
}
