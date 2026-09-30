// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_log_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallLogDto _$CallLogDtoFromJson(Map<String, dynamic> json) => CallLogDto(
  outcome: CallOutcome.fromJson(json['outcome'] as String),
  durationSec: (json['durationSec'] as num).toInt(),
);

Map<String, dynamic> _$CallLogDtoToJson(CallLogDto instance) =>
    <String, dynamic>{
      'outcome': instance.outcome.toJson(),
      'durationSec': instance.durationSec,
    };
