// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_user_usage_dto.g.dart';

@JsonSerializable()
class StorageUserUsageDto {
  const StorageUserUsageDto({
    required this.userId,
    required this.name,
    required this.email,
    required this.bytes,
    required this.count,
    required this.quotaMb,
  });

  factory StorageUserUsageDto.fromJson(Map<String, Object?> json) =>
      _$StorageUserUsageDtoFromJson(json);

  final String userId;
  final String? name;
  final String? email;
  final num bytes;
  final num count;

  /// Personal cap in MB; null = the default.
  final num? quotaMb;

  Map<String, Object?> toJson() => _$StorageUserUsageDtoToJson(this);
}
