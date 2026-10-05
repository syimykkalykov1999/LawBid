// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scale_mode_dto_by.dart';
import 'scale_mode_dto_mode.dart';

part 'scale_mode_dto.g.dart';

@JsonSerializable()
class ScaleModeDto {
  const ScaleModeDto({required this.mode, required this.by, required this.at});

  factory ScaleModeDto.fromJson(Map<String, Object?> json) =>
      _$ScaleModeDtoFromJson(json);

  final ScaleModeDtoMode mode;
  final ScaleModeDtoBy by;
  final String at;

  Map<String, Object?> toJson() => _$ScaleModeDtoToJson(this);
}
