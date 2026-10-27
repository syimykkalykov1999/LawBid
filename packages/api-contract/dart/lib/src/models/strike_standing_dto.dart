// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'strike_dto.dart';
import 'strike_limit_dto.dart';

part 'strike_standing_dto.g.dart';

@JsonSerializable()
class StrikeStandingDto {
  const StrikeStandingDto({
    required this.enabled,
    required this.points,
    required this.limit,
    required this.strikes,
  });

  factory StrikeStandingDto.fromJson(Map<String, Object?> json) =>
      _$StrikeStandingDtoFromJson(json);

  final bool enabled;
  final int points;
  final StrikeLimitDto limit;
  final List<StrikeDto> strikes;

  Map<String, Object?> toJson() => _$StrikeStandingDtoToJson(this);
}
