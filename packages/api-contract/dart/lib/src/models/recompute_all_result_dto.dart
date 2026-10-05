// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'recompute_all_result_dto.g.dart';

@JsonSerializable()
class RecomputeAllResultDto {
  const RecomputeAllResultDto({required this.attorneys, required this.changed});

  factory RecomputeAllResultDto.fromJson(Map<String, Object?> json) =>
      _$RecomputeAllResultDtoFromJson(json);

  final int attorneys;
  final int changed;

  Map<String, Object?> toJson() => _$RecomputeAllResultDtoToJson(this);
}
