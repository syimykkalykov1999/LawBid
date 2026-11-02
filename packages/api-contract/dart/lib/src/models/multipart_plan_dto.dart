// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'multipart_part_dto.dart';

part 'multipart_plan_dto.g.dart';

@JsonSerializable()
class MultipartPlanDto {
  const MultipartPlanDto({
    required this.partSizeBytes,
    required this.partCount,
    required this.uploadedParts,
    required this.parts,
    required this.expiresAt,
  });

  factory MultipartPlanDto.fromJson(Map<String, Object?> json) =>
      _$MultipartPlanDtoFromJson(json);

  /// Size of every part except the last one (the last is the remainder).
  final num partSizeBytes;
  final num partCount;

  /// Part numbers S3 already holds (an interrupted upload continues from here).
  final List<num> uploadedParts;

  /// Links for the parts still to send, ascending.
  final List<MultipartPartDto> parts;

  /// The part links expire at; ask for the plan again after.
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$MultipartPlanDtoToJson(this);
}
