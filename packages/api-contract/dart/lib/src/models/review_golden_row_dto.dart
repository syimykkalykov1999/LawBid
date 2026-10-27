// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_person_ref_dto.dart';
import 'staff_golden_state.dart';

part 'review_golden_row_dto.g.dart';

@JsonSerializable()
class ReviewGoldenRowDto {
  const ReviewGoldenRowDto({
    required this.id,
    required this.decisionKind,
    required this.state,
    required this.worker,
    required this.createdAt,
    required this.doneAt,
  });

  factory ReviewGoldenRowDto.fromJson(Map<String, Object?> json) =>
      _$ReviewGoldenRowDtoFromJson(json);

  final String id;
  final String decisionKind;
  final StaffGoldenState state;
  final ReviewPersonRefDto worker;
  final DateTime createdAt;
  final DateTime? doneAt;

  Map<String, Object?> toJson() => _$ReviewGoldenRowDtoToJson(this);
}
