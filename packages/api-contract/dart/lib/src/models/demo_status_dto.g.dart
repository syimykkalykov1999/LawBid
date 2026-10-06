// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoStatusDto _$DemoStatusDtoFromJson(Map<String, dynamic> json) =>
    DemoStatusDto(
      ready: json['ready'] as bool,
      reason: json['reason'] as String?,
      databaseName: json['databaseName'] as String?,
      accounts: json['accounts'] as num,
      lastResetAt: json['lastResetAt'] == null
          ? null
          : DateTime.parse(json['lastResetAt'] as String),
      lastSweepAt: json['lastSweepAt'] == null
          ? null
          : DateTime.parse(json['lastSweepAt'] as String),
      migrationsApplied: json['migrationsApplied'] as num,
      migrationsPending: json['migrationsPending'] as num,
      seedCounts: (json['seedCounts'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as num),
      ),
    );

Map<String, dynamic> _$DemoStatusDtoToJson(DemoStatusDto instance) =>
    <String, dynamic>{
      'ready': instance.ready,
      'reason': ?instance.reason,
      'databaseName': ?instance.databaseName,
      'accounts': instance.accounts,
      'lastResetAt': ?instance.lastResetAt?.toIso8601String(),
      'lastSweepAt': ?instance.lastSweepAt?.toIso8601String(),
      'migrationsApplied': instance.migrationsApplied,
      'migrationsPending': instance.migrationsPending,
      'seedCounts': ?instance.seedCounts,
    };
