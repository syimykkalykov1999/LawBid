// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_history_point_dto.g.dart';

@JsonSerializable()
class StorageHistoryPointDto {
  const StorageHistoryPointDto({
    required this.day,
    required this.filesBytes,
    required this.storedBytes,
    required this.dbBytes,
    required this.filesCount,
  });

  factory StorageHistoryPointDto.fromJson(Map<String, Object?> json) =>
      _$StorageHistoryPointDtoFromJson(json);

  final String day;
  final num filesBytes;
  final num storedBytes;
  final num dbBytes;
  final num filesCount;

  Map<String, Object?> toJson() => _$StorageHistoryPointDtoToJson(this);
}
