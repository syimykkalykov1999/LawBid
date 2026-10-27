// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reporter_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReporterRowDto _$ReporterRowDtoFromJson(Map<String, dynamic> json) =>
    ReporterRowDto(
      userId: json['userId'] as String,
      name: json['name'] as String?,
      accountCreatedAt: DateTime.parse(json['accountCreatedAt'] as String),
      verifiedAttorney: json['verifiedAttorney'] as bool,
      total: (json['total'] as num).toInt(),
      upheld: (json['upheld'] as num).toInt(),
      rejected: (json['rejected'] as num).toInt(),
      pending: (json['pending'] as num).toInt(),
      warnings: (json['warnings'] as num).toInt(),
      suspendedUntil: json['suspendedUntil'] == null
          ? null
          : DateTime.parse(json['suspendedUntil'] as String),
      suspensions: (json['suspensions'] as num).toInt(),
      appealStatus: json['appealStatus'] as String?,
      appealMessage: json['appealMessage'] as String?,
      lastReason: json['lastReason'] as String?,
      history: (json['history'] as List<dynamic>)
          .map(
            (e) => ReporterHistoryEntryDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$ReporterRowDtoToJson(ReporterRowDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'name': ?instance.name,
      'accountCreatedAt': instance.accountCreatedAt.toIso8601String(),
      'verifiedAttorney': instance.verifiedAttorney,
      'total': instance.total,
      'upheld': instance.upheld,
      'rejected': instance.rejected,
      'pending': instance.pending,
      'warnings': instance.warnings,
      'suspendedUntil': ?instance.suspendedUntil?.toIso8601String(),
      'suspensions': instance.suspensions,
      'appealStatus': ?instance.appealStatus,
      'appealMessage': ?instance.appealMessage,
      'lastReason': ?instance.lastReason,
      'history': instance.history.map((e) => e.toJson()).toList(),
    };
