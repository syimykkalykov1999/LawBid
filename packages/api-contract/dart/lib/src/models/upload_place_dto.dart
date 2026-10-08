// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'upload_ceiling_dto.dart';
import 'upload_count_mode.dart';
import 'upload_format.dart';
import 'upload_place_limits_dto.dart';

part 'upload_place_dto.g.dart';

@JsonSerializable()
class UploadPlaceDto {
  const UploadPlaceDto({
    required this.limits,
    required this.count,
    required this.safeFormats,
    required this.ceiling,
    required this.defaults,
  });

  factory UploadPlaceDto.fromJson(Map<String, Object?> json) =>
      _$UploadPlaceDtoFromJson(json);

  final UploadPlaceLimitsDto limits;
  final UploadCountMode count;

  /// Formats that may be turned on here (all safe).
  final List<UploadFormat> safeFormats;
  final UploadCeilingDto ceiling;
  final UploadPlaceLimitsDto defaults;

  Map<String, Object?> toJson() => _$UploadPlaceDtoToJson(this);
}
