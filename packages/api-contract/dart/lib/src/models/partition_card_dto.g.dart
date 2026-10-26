// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partition_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartitionCardDto _$PartitionCardDtoFromJson(Map<String, dynamic> json) =>
    PartitionCardDto(
      table: json['table'] as String,
      label: json['label'] as String,
      rows: (json['rows'] as num).toInt(),
      bytes: (json['bytes'] as num).toInt(),
      partitioned: json['partitioned'] as bool,
      partitions: (json['partitions'] as num).toInt(),
      state: PartitionCardDtoState.fromJson(json['state'] as String),
      blockedBy: (json['blockedBy'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      progress: (json['progress'] as num?)?.toInt(),
      phase: json['phase'] as String?,
      error: json['error'] as String?,
      paused: json['paused'] as bool,
      canStart: json['canStart'] as bool,
      canUndo: json['canUndo'] as bool,
      canFinalize: json['canFinalize'] as bool,
      finalizeAfter: json['finalizeAfter'] == null
          ? null
          : DateTime.parse(json['finalizeAfter'] as String),
      overThreshold: json['overThreshold'] as bool,
      runnerConfigured: json['runnerConfigured'] as bool,
      mode: json['mode'] == null
          ? null
          : PartitionCardDtoMode.fromJson(json['mode'] as String),
      autoRows: (json['autoRows'] as num).toInt(),
    );

Map<String, dynamic> _$PartitionCardDtoToJson(PartitionCardDto instance) =>
    <String, dynamic>{
      'table': instance.table,
      'label': instance.label,
      'rows': instance.rows,
      'bytes': instance.bytes,
      'partitioned': instance.partitioned,
      'partitions': instance.partitions,
      'state': instance.state.toJson(),
      'blockedBy': instance.blockedBy,
      'progress': ?instance.progress,
      'phase': ?instance.phase,
      'error': ?instance.error,
      'paused': instance.paused,
      'canStart': instance.canStart,
      'canUndo': instance.canUndo,
      'canFinalize': instance.canFinalize,
      'finalizeAfter': ?instance.finalizeAfter?.toIso8601String(),
      'overThreshold': instance.overThreshold,
      'runnerConfigured': instance.runnerConfigured,
      'mode': ?instance.mode?.toJson(),
      'autoRows': instance.autoRows,
    };
