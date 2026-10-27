// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_watermark_dto.g.dart';

@JsonSerializable()
class StaffWatermarkDto {
  const StaffWatermarkDto({required this.enabled, required this.text});

  factory StaffWatermarkDto.fromJson(Map<String, Object?> json) =>
      _$StaffWatermarkDtoFromJson(json);

  /// True when the panel must draw the watermark.
  final bool enabled;

  /// Who the watermark names: login (or e-mail) and a short id.
  final String text;

  Map<String, Object?> toJson() => _$StaffWatermarkDtoToJson(this);
}
