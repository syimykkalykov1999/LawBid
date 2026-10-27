// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'access_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AccessReportDto _$AccessReportDtoFromJson(Map<String, dynamic> json) =>
    AccessReportDto(
      month: json['month'] as String,
      from: DateTime.parse(json['from'] as String),
      to: DateTime.parse(json['to'] as String),
      total: json['total'] as num,
      rows: (json['rows'] as List<dynamic>)
          .map((e) => AccessReportRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AccessReportDtoToJson(AccessReportDto instance) =>
    <String, dynamic>{
      'month': instance.month,
      'from': instance.from.toIso8601String(),
      'to': instance.to.toIso8601String(),
      'total': instance.total,
      'rows': instance.rows.map((e) => e.toJson()).toList(),
    };
