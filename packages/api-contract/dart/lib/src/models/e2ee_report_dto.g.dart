// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'e2ee_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

E2eeReportDto _$E2eeReportDtoFromJson(Map<String, dynamic> json) =>
    E2eeReportDto(
      reportedUserId: json['reportedUserId'] as String,
      reason: E2eeReportReason.fromJson(json['reason'] as String),
      messages: (json['messages'] as List<dynamic>)
          .map(
            (e) => E2eeReportedMessageDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$E2eeReportDtoToJson(E2eeReportDto instance) =>
    <String, dynamic>{
      'reportedUserId': instance.reportedUserId,
      'reason': instance.reason.toJson(),
      'note': ?instance.note,
      'messages': instance.messages.map((e) => e.toJson()).toList(),
    };
