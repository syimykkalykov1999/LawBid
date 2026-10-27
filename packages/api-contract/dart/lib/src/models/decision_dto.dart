// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'decision_dto.g.dart';

@JsonSerializable()
class DecisionDto {
  const DecisionDto({required this.note, required this.accept});

  factory DecisionDto.fromJson(Map<String, Object?> json) =>
      _$DecisionDtoFromJson(json);

  final String note;

  /// true = approve the appeal, false = keep.
  final bool accept;

  Map<String, Object?> toJson() => _$DecisionDtoToJson(this);
}
