// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reporter_history_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReporterHistoryEntryDto _$ReporterHistoryEntryDtoFromJson(
  Map<String, dynamic> json,
) => ReporterHistoryEntryDto(
  at: DateTime.parse(json['at'] as String),
  kind: json['kind'] as String,
  reason: json['reason'] as String,
);

Map<String, dynamic> _$ReporterHistoryEntryDtoToJson(
  ReporterHistoryEntryDto instance,
) => <String, dynamic>{
  'at': instance.at.toIso8601String(),
  'kind': instance.kind,
  'reason': instance.reason,
};
