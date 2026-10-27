// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reporting_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReportingStatusDto _$ReportingStatusDtoFromJson(Map<String, dynamic> json) =>
    ReportingStatusDto(
      warnings: (json['warnings'] as num).toInt(),
      suspendedUntil: json['suspendedUntil'] == null
          ? null
          : DateTime.parse(json['suspendedUntil'] as String),
      canAppeal: json['canAppeal'] as bool,
      appealStatus: json['appealStatus'] as String?,
      appealNote: json['appealNote'] as String?,
    );

Map<String, dynamic> _$ReportingStatusDtoToJson(ReportingStatusDto instance) =>
    <String, dynamic>{
      'warnings': instance.warnings,
      'suspendedUntil': ?instance.suspendedUntil?.toIso8601String(),
      'canAppeal': instance.canAppeal,
      'appealStatus': ?instance.appealStatus,
      'appealNote': ?instance.appealNote,
    };
