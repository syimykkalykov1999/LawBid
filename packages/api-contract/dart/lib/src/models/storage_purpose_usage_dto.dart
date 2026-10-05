// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_purpose_usage_dto.g.dart';

@JsonSerializable()
class StoragePurposeUsageDto {
  const StoragePurposeUsageDto({
    required this.purpose,
    required this.count,
    required this.bytes,
  });

  factory StoragePurposeUsageDto.fromJson(Map<String, Object?> json) =>
      _$StoragePurposeUsageDtoFromJson(json);

  final String purpose;
  final num count;
  final num bytes;

  Map<String, Object?> toJson() => _$StoragePurposeUsageDtoToJson(this);
}
