// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_sync_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactSyncStatusDto _$ContactSyncStatusDtoFromJson(
  Map<String, dynamic> json,
) => ContactSyncStatusDto(
  enabled: json['enabled'] as bool,
  matches: (json['matches'] as num).toInt(),
  syncedAt: json['syncedAt'] == null
      ? null
      : DateTime.parse(json['syncedAt'] as String),
);

Map<String, dynamic> _$ContactSyncStatusDtoToJson(
  ContactSyncStatusDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'matches': instance.matches,
  'syncedAt': ?instance.syncedAt?.toIso8601String(),
};
