// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_issue_resolution_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactIssueResolutionDto _$ContactIssueResolutionDtoFromJson(
  Map<String, dynamic> json,
) => ContactIssueResolutionDto(
  report: ContactIssueReportDto.fromJson(
    json['report'] as Map<String, dynamic>,
  ),
  confirmedReports: json['confirmedReports'] as num,
  clientSuspended: json['clientSuspended'] as bool,
);

Map<String, dynamic> _$ContactIssueResolutionDtoToJson(
  ContactIssueResolutionDto instance,
) => <String, dynamic>{
  'report': instance.report.toJson(),
  'confirmedReports': instance.confirmedReports,
  'clientSuspended': instance.clientSuspended,
};
