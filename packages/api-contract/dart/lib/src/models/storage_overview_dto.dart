// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'storage_history_point_dto.dart';
import 'storage_last_cleanup_dto.dart';
import 'storage_purpose_usage_dto.dart';
import 'storage_settings_dto.dart';
import 'storage_table_usage_dto.dart';
import 'storage_user_usage_dto.dart';

part 'storage_overview_dto.g.dart';

@JsonSerializable()
class StorageOverviewDto {
  const StorageOverviewDto({
    required this.filesBytes,
    required this.filesCount,
    required this.storedBytes,
    required this.dedupSavedBytes,
    required this.pendingRemovalCount,
    required this.pendingRemovalBytes,
    required this.byPurpose,
    required this.tables,
    required this.topUsers,
    required this.history,
    required this.lastCleanup,
    required this.settings,
  });

  factory StorageOverviewDto.fromJson(Map<String, Object?> json) =>
      _$StorageOverviewDtoFromJson(json);

  /// Live files as users see them.
  final num filesBytes;
  final num filesCount;

  /// What S3 keeps (shared copies once).
  final num storedBytes;

  /// filesBytes − storedBytes.
  final num dedupSavedBytes;
  final num pendingRemovalCount;
  final num pendingRemovalBytes;
  final List<StoragePurposeUsageDto> byPurpose;
  final List<StorageTableUsageDto> tables;
  final List<StorageUserUsageDto> topUsers;
  final List<StorageHistoryPointDto> history;
  final StorageLastCleanupDto? lastCleanup;
  final StorageSettingsDto settings;

  Map<String, Object?> toJson() => _$StorageOverviewDtoToJson(this);
}
