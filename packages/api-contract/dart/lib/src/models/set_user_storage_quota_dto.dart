// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_user_storage_quota_dto.g.dart';

@JsonSerializable()
class SetUserStorageQuotaDto {
  const SetUserStorageQuotaDto({required this.quotaMb});

  factory SetUserStorageQuotaDto.fromJson(Map<String, Object?> json) =>
      _$SetUserStorageQuotaDtoFromJson(json);

  /// MB; 0 = no cap, null = back to the default.
  final num? quotaMb;

  Map<String, Object?> toJson() => _$SetUserStorageQuotaDtoToJson(this);
}
