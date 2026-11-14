// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_flag_dto.g.dart';

@JsonSerializable()
class UpdateFlagDto {
  const UpdateFlagDto({this.enabled, this.rolloutPercent, this.hashVersion});

  factory UpdateFlagDto.fromJson(Map<String, Object?> json) =>
      _$UpdateFlagDtoFromJson(json);

  final bool? enabled;
  final int? rolloutPercent;

  /// Bucketing hash of the partial rollout: 1 = old FNV-1a, 2 = GrowthBook v2. Changing it re-picks who has the flag.
  final int? hashVersion;

  Map<String, Object?> toJson() => _$UpdateFlagDtoToJson(this);
}
