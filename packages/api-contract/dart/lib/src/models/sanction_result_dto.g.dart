// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sanction_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SanctionResultDto _$SanctionResultDtoFromJson(Map<String, dynamic> json) =>
    SanctionResultDto(
      userId: json['userId'] as String,
      status: json['status'] as String,
      revokedSessions: (json['revokedSessions'] as num).toInt(),
      archivedCases: (json['archivedCases'] as num).toInt(),
      withdrawnBids: (json['withdrawnBids'] as num).toInt(),
    );

Map<String, dynamic> _$SanctionResultDtoToJson(SanctionResultDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'status': instance.status,
      'revokedSessions': instance.revokedSessions,
      'archivedCases': instance.archivedCases,
      'withdrawnBids': instance.withdrawnBids,
    };
