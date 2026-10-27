// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'access_report_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AccessReportRowDto _$AccessReportRowDtoFromJson(Map<String, dynamic> json) =>
    AccessReportRowDto(
      adminId: json['adminId'] as String,
      adminEmail: json['adminEmail'] as String?,
      kind: json['kind'] as String,
      reasonCode: json['reasonCode'] as String?,
      count: json['count'] as num,
    );

Map<String, dynamic> _$AccessReportRowDtoToJson(AccessReportRowDto instance) =>
    <String, dynamic>{
      'adminId': instance.adminId,
      'adminEmail': ?instance.adminEmail,
      'kind': instance.kind,
      'reasonCode': ?instance.reasonCode,
      'count': instance.count,
    };
