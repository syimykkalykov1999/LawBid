// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cost_ladder_day_one_dto.g.dart';

@JsonSerializable()
class CostLadderDayOneDto {
  const CostLadderDayOneDto({
    required this.aws,
    required this.vendors,
    required this.all,
  });

  factory CostLadderDayOneDto.fromJson(Map<String, Object?> json) =>
      _$CostLadderDayOneDtoFromJson(json);

  final List<num> aws;
  final List<num> vendors;
  final List<num> all;

  Map<String, Object?> toJson() => _$CostLadderDayOneDtoToJson(this);
}
