// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'restrict_reporter_dto.g.dart';

@JsonSerializable()
class RestrictReporterDto {
  const RestrictReporterDto({required this.note, required this.days});

  factory RestrictReporterDto.fromJson(Map<String, Object?> json) =>
      _$RestrictReporterDtoFromJson(json);

  final String note;
  final int days;

  Map<String, Object?> toJson() => _$RestrictReporterDtoToJson(this);
}
