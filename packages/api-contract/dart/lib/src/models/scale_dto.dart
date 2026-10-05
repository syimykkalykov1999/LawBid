// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scale_dto_mode.dart';

part 'scale_dto.g.dart';

@JsonSerializable()
class ScaleDto {
  const ScaleDto({required this.mode});

  factory ScaleDto.fromJson(Map<String, Object?> json) =>
      _$ScaleDtoFromJson(json);

  final ScaleDtoMode mode;

  Map<String, Object?> toJson() => _$ScaleDtoToJson(this);
}
