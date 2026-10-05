// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_storage_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateStorageSettingsDto _$UpdateStorageSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateStorageSettingsDto(
  dedup: json['dedup'] as bool?,
  autoCleanup: json['autoCleanup'] as bool?,
  orphanGraceHours: json['orphanGraceHours'] as num?,
  purgeAfterDays: json['purgeAfterDays'] as num?,
  deletedPostsMediaDays: json['deletedPostsMediaDays'] as num?,
  imageFormat: json['imageFormat'] == null
      ? null
      : StorageImageFormat.fromJson(json['imageFormat'] as String),
  userQuotaMb: json['userQuotaMb'] as num?,
  chatQuotaMb: json['chatQuotaMb'] as num?,
  autoRetention: json['autoRetention'] as bool?,
  retentionAuthEventsDays: json['retentionAuthEventsDays'] as num?,
  retentionAssistantActivityDays:
      json['retentionAssistantActivityDays'] as num?,
  notificationsRetentionDays: json['notificationsRetentionDays'] as num?,
  growthAlertPercent: json['growthAlertPercent'] as num?,
);

Map<String, dynamic> _$UpdateStorageSettingsDtoToJson(
  UpdateStorageSettingsDto instance,
) => <String, dynamic>{
  'dedup': ?instance.dedup,
  'autoCleanup': ?instance.autoCleanup,
  'orphanGraceHours': ?instance.orphanGraceHours,
  'purgeAfterDays': ?instance.purgeAfterDays,
  'deletedPostsMediaDays': ?instance.deletedPostsMediaDays,
  'imageFormat': ?instance.imageFormat?.toJson(),
  'userQuotaMb': ?instance.userQuotaMb,
  'chatQuotaMb': ?instance.chatQuotaMb,
  'autoRetention': ?instance.autoRetention,
  'retentionAuthEventsDays': ?instance.retentionAuthEventsDays,
  'retentionAssistantActivityDays': ?instance.retentionAssistantActivityDays,
  'notificationsRetentionDays': ?instance.notificationsRetentionDays,
  'growthAlertPercent': ?instance.growthAlertPercent,
};
