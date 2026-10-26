// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_table_usage_dto.g.dart';

@JsonSerializable()
class StorageTableUsageDto {
  const StorageTableUsageDto({
    required this.table,
    required this.rows,
    required this.bytes,
  });

  factory StorageTableUsageDto.fromJson(Map<String, Object?> json) =>
      _$StorageTableUsageDtoFromJson(json);

  final String table;
  final num rows;
  final num bytes;

  Map<String, Object?> toJson() => _$StorageTableUsageDtoToJson(this);
}
