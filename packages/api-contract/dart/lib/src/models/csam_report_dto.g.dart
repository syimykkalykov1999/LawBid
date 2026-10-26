// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'csam_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CsamReportDto _$CsamReportDtoFromJson(Map<String, dynamic> json) =>
    CsamReportDto(
      id: json['id'] as String,
      checkId: json['checkId'] as String,
      status: CsamReportDtoStatus.fromJson(json['status'] as String),
      externalReportId: json['externalReportId'] as String?,
      error: json['error'] as String?,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$CsamReportDtoToJson(CsamReportDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'checkId': instance.checkId,
      'status': instance.status.toJson(),
      'externalReportId': ?instance.externalReportId,
      'error': ?instance.error,
      'createdAt': instance.createdAt,
    };
