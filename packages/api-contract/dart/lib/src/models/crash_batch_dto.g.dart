// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_batch_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashBatchDto _$CrashBatchDtoFromJson(Map<String, dynamic> json) =>
    CrashBatchDto(
      reports: (json['reports'] as List<dynamic>)
          .map((e) => CrashReportInDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CrashBatchDtoToJson(CrashBatchDto instance) =>
    <String, dynamic>{
      'reports': instance.reports.map((e) => e.toJson()).toList(),
    };
