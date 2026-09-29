// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resolve_case_dispute_dto_decision.dart';

part 'resolve_case_dispute_dto.g.dart';

@JsonSerializable()
class ResolveCaseDisputeDto {
  const ResolveCaseDisputeDto({required this.decision, required this.note});

  factory ResolveCaseDisputeDto.fromJson(Map<String, Object?> json) =>
      _$ResolveCaseDisputeDtoFromJson(json);

  final ResolveCaseDisputeDtoDecision decision;
  final String note;

  Map<String, Object?> toJson() => _$ResolveCaseDisputeDtoToJson(this);
}
