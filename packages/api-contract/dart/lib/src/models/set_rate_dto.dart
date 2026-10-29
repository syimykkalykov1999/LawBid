// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_rate_dto.g.dart';

@JsonSerializable()
class SetRateDto {
  const SetRateDto({
    required this.hourlyRateCents,
  });
  
  factory SetRateDto.fromJson(Map<String, Object?> json) => _$SetRateDtoFromJson(json);
  
  /// Cents per hour
  final num hourlyRateCents;

  Map<String, Object?> toJson() => _$SetRateDtoToJson(this);
}
