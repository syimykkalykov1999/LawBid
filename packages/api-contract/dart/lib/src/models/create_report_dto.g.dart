// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateReportDto _$CreateReportDtoFromJson(Map<String, dynamic> json) =>
    CreateReportDto(
      targetType: ReportTargetType.fromJson(json['targetType'] as String),
      targetId: json['targetId'] as String,
      reason: ReportReason.fromJson(json['reason'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$CreateReportDtoToJson(CreateReportDto instance) =>
    <String, dynamic>{
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
      'reason': instance.reason.toJson(),
      'note': ?instance.note,
    };
