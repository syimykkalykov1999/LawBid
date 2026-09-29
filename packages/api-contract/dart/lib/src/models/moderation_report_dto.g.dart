// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationReportDto _$ModerationReportDtoFromJson(Map<String, dynamic> json) =>
    ModerationReportDto(
      id: json['id'] as String,
      reporterId: json['reporterId'] as String,
      reason: json['reason'] as String,
      note: json['note'] as String?,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      handledAt: json['handledAt'] == null
          ? null
          : DateTime.parse(json['handledAt'] as String),
    );

Map<String, dynamic> _$ModerationReportDtoToJson(
  ModerationReportDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'reporterId': instance.reporterId,
  'reason': instance.reason,
  'note': ?instance.note,
  'status': instance.status,
  'createdAt': instance.createdAt.toIso8601String(),
  'handledAt': ?instance.handledAt?.toIso8601String(),
};
