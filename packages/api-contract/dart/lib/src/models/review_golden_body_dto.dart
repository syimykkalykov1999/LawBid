// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_golden_body_dto.g.dart';

@JsonSerializable()
class ReviewGoldenBodyDto {
  const ReviewGoldenBodyDto({required this.sampleId, this.workerId});

  factory ReviewGoldenBodyDto.fromJson(Map<String, Object?> json) =>
      _$ReviewGoldenBodyDtoFromJson(json);

  /// A re-check sample that a reviewer CONFIRMED.
  final String sampleId;

  /// The worker who gets this task (same workspace, a role that works this kind). Omit: one is picked at random.
  final String? workerId;

  Map<String, Object?> toJson() => _$ReviewGoldenBodyDtoToJson(this);
}
