// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'e2ee_report_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

E2eeReportResultDto _$E2eeReportResultDtoFromJson(Map<String, dynamic> json) =>
    E2eeReportResultDto(
      reportId: json['reportId'] as String,
      verified: json['verified'] as num,
      total: json['total'] as num,
    );

Map<String, dynamic> _$E2eeReportResultDtoToJson(
  E2eeReportResultDto instance,
) => <String, dynamic>{
  'reportId': instance.reportId,
  'verified': instance.verified,
  'total': instance.total,
};
