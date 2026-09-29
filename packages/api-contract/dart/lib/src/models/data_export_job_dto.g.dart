// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_export_job_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataExportJobDto _$DataExportJobDtoFromJson(Map<String, dynamic> json) =>
    DataExportJobDto(
      exportId: json['exportId'] as String,
      status: DataExportJobDtoStatus.fromJson(json['status'] as String),
      url: json['url'] as String?,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$DataExportJobDtoToJson(DataExportJobDto instance) =>
    <String, dynamic>{
      'exportId': instance.exportId,
      'status': instance.status.toJson(),
      'url': ?instance.url,
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
