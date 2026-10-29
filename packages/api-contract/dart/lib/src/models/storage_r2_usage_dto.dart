// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_r2_usage_dto.g.dart';

@JsonSerializable()
class StorageR2UsageDto {
  const StorageR2UsageDto({
    required this.bytes,
    required this.objects,
    required this.truncated,
    required this.updatedAt,
  });
  
  factory StorageR2UsageDto.fromJson(Map<String, Object?> json) => _$StorageR2UsageDtoFromJson(json);
  
  /// Bytes in the R2 bucket (public media).
  final num bytes;
  final num objects;

  /// Counted only partly (a lower bound).
  final bool truncated;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$StorageR2UsageDtoToJson(this);
}
