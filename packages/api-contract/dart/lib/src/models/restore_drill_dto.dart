// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'restore_drill_dto.g.dart';

@JsonSerializable()
class RestoreDrillDto {
  const RestoreDrillDto({this.note});

  factory RestoreDrillDto.fromJson(Map<String, Object?> json) =>
      _$RestoreDrillDtoFromJson(json);

  /// Free note, e.g. the RTO the script printed.
  final String? note;

  Map<String, Object?> toJson() => _$RestoreDrillDtoToJson(this);
}
