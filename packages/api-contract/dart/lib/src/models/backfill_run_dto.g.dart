// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'backfill_run_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BackfillRunDto _$BackfillRunDtoFromJson(Map<String, dynamic> json) =>
    BackfillRunDto(
      name: json['name'] as String,
      status: BackfillRunDtoStatus.fromJson(json['status'] as String),
      tableName: json['tableName'] as String,
      processed: json['processed'] as num,
      totalEstimate: json['totalEstimate'] as num?,
      percent: json['percent'] as num?,
      batchSize: json['batchSize'] as num,
      maxRowsPerSec: json['maxRowsPerSec'] as num,
      pauseReason: json['pauseReason'] as String?,
      lastError: json['lastError'] as String?,
      stalled: json['stalled'] as bool,
      startedAt: DateTime.parse(json['startedAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$BackfillRunDtoToJson(BackfillRunDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'status': instance.status.toJson(),
      'tableName': instance.tableName,
      'processed': instance.processed,
      'totalEstimate': ?instance.totalEstimate,
      'percent': ?instance.percent,
      'batchSize': instance.batchSize,
      'maxRowsPerSec': instance.maxRowsPerSec,
      'pauseReason': ?instance.pauseReason,
      'lastError': ?instance.lastError,
      'stalled': instance.stalled,
      'startedAt': instance.startedAt.toIso8601String(),
      'updatedAt': instance.updatedAt.toIso8601String(),
    };
