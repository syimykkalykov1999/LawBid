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
  findByPhone: json['findByPhone'] as bool,
  notifyJoined: json['notifyJoined'] as bool,
  syncedAt: json['syncedAt'] == null
      ? null
      : DateTime.parse(json['syncedAt'] as String),
  phoneRegion: json['phoneRegion'] as String?,
);

Map<String, dynamic> _$ContactSyncStatusDtoToJson(
  ContactSyncStatusDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'matches': instance.matches,
  'syncedAt': ?instance.syncedAt?.toIso8601String(),
  'findByPhone': instance.findByPhone,
  'phoneRegion': ?instance.phoneRegion,
  'notifyJoined': instance.notifyJoined,
};
