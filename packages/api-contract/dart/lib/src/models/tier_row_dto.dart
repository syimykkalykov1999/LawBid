// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'tier_row_dto.g.dart';

@JsonSerializable()
class TierRowDto {
  const TierRowDto({
    required this.name,
    required this.memoryGb,
    required this.monthUsd,
    required this.current,
  });

  factory TierRowDto.fromJson(Map<String, Object?> json) =>
      _$TierRowDtoFromJson(json);

  final String name;
  final num memoryGb;
  final num monthUsd;
  final bool current;

  Map<String, Object?> toJson() => _$TierRowDtoToJson(this);
}
