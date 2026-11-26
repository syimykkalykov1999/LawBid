// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'settings_rollout_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SettingsRolloutDto _$SettingsRolloutDtoFromJson(Map<String, dynamic> json) =>
    SettingsRolloutDto(
      id: json['id'] as String,
      adminId: json['adminId'] as String,
      action: json['action'] as String,
      keys: (json['keys'] as List<dynamic>).map((e) => e as String).toList(),
      before: json['before'],
      after: json['after'],
      startedAt: DateTime.parse(json['startedAt'] as String),
      watchUntil: DateTime.parse(json['watchUntil'] as String),
      percent: json['percent'] as num,
    );

Map<String, dynamic> _$SettingsRolloutDtoToJson(SettingsRolloutDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'adminId': instance.adminId,
      'action': instance.action,
      'keys': instance.keys,
      'before': ?instance.before,
      'after': ?instance.after,
      'startedAt': instance.startedAt.toIso8601String(),
      'watchUntil': instance.watchUntil.toIso8601String(),
      'percent': instance.percent,
    };
