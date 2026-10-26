// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'user_storage_quota_dto.g.dart';

@JsonSerializable()
class UserStorageQuotaDto {
  const UserStorageQuotaDto({
    required this.userId,
    required this.quotaMb,
    required this.usedBytes,
    required this.quotaBytes,
  });

  factory UserStorageQuotaDto.fromJson(Map<String, Object?> json) =>
      _$UserStorageQuotaDtoFromJson(json);

  final String userId;
  final num? quotaMb;
  final num usedBytes;
  final num? quotaBytes;

  Map<String, Object?> toJson() => _$UserStorageQuotaDtoToJson(this);
}
