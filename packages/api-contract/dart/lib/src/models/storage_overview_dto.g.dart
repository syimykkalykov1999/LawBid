// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageOverviewDto _$StorageOverviewDtoFromJson(
  Map<String, dynamic> json,
) => StorageOverviewDto(
  filesBytes: json['filesBytes'] as num,
  filesCount: json['filesCount'] as num,
  storedBytes: json['storedBytes'] as num,
  dedupSavedBytes: json['dedupSavedBytes'] as num,
  pendingRemovalCount: json['pendingRemovalCount'] as num,
  pendingRemovalBytes: json['pendingRemovalBytes'] as num,
  byPurpose: (json['byPurpose'] as List<dynamic>)
      .map((e) => StoragePurposeUsageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  tables: (json['tables'] as List<dynamic>)
      .map((e) => StorageTableUsageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  topUsers: (json['topUsers'] as List<dynamic>)
      .map((e) => StorageUserUsageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  history: (json['history'] as List<dynamic>)
      .map((e) => StorageHistoryPointDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  lastCleanup: json['lastCleanup'] == null
      ? null
      : StorageLastCleanupDto.fromJson(
          json['lastCleanup'] as Map<String, dynamic>,
        ),
  settings: StorageSettingsDto.fromJson(
    json['settings'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$StorageOverviewDtoToJson(StorageOverviewDto instance) =>
    <String, dynamic>{
      'filesBytes': instance.filesBytes,
      'filesCount': instance.filesCount,
      'storedBytes': instance.storedBytes,
      'dedupSavedBytes': instance.dedupSavedBytes,
      'pendingRemovalCount': instance.pendingRemovalCount,
      'pendingRemovalBytes': instance.pendingRemovalBytes,
      'byPurpose': instance.byPurpose.map((e) => e.toJson()).toList(),
      'tables': instance.tables.map((e) => e.toJson()).toList(),
      'topUsers': instance.topUsers.map((e) => e.toJson()).toList(),
      'history': instance.history.map((e) => e.toJson()).toList(),
      'lastCleanup': ?instance.lastCleanup?.toJson(),
      'settings': instance.settings.toJson(),
    };
