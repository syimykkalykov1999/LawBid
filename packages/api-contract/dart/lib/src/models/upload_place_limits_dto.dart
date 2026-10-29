// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'upload_format.dart';
import 'upload_place.dart';

part 'upload_place_limits_dto.g.dart';

@JsonSerializable()
class UploadPlaceLimitsDto {
  const UploadPlaceLimitsDto({
    required this.place,
    required this.maxPhotos,
    required this.maxFiles,
    required this.fileMb,
    required this.totalMb,
    required this.formats,
  });
  
  factory UploadPlaceLimitsDto.fromJson(Map<String, Object?> json) => _$UploadPlaceLimitsDtoFromJson(json);
  
  final UploadPlace place;
  final num maxPhotos;
  final num maxFiles;
  final num fileMb;
  final num totalMb;
  final List<UploadFormat> formats;

  Map<String, Object?> toJson() => _$UploadPlaceLimitsDtoToJson(this);
}
