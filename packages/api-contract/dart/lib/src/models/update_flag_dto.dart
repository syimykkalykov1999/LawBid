// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_flag_dto_hash_version.dart';

part 'update_flag_dto.g.dart';

@JsonSerializable()
class UpdateFlagDto {
  const UpdateFlagDto({this.enabled, this.rolloutPercent, this.hashVersion});

  factory UpdateFlagDto.fromJson(Map<String, Object?> json) =>
      _$UpdateFlagDtoFromJson(json);

  final bool? enabled;
  final int? rolloutPercent;

  /// Bucketing hash of a partial rollout: 2 = GrowthBook hash v2, 1 = the original FNV-1a. Changing it re-picks who is inside.
  final UpdateFlagDtoHashVersion? hashVersion;

  Map<String, Object?> toJson() => _$UpdateFlagDtoToJson(this);
}
