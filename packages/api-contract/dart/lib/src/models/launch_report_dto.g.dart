// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'launch_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LaunchReportDto _$LaunchReportDtoFromJson(Map<String, dynamic> json) =>
    LaunchReportDto(
      generatedAt: json['generatedAt'] as String,
      items: (json['items'] as List<dynamic>)
          .map((e) => LaunchItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      greenCount: json['greenCount'] as num,
      total: json['total'] as num,
    );

Map<String, dynamic> _$LaunchReportDtoToJson(LaunchReportDto instance) =>
    <String, dynamic>{
      'generatedAt': instance.generatedAt,
      'items': instance.items.map((e) => e.toJson()).toList(),
      'greenCount': instance.greenCount,
      'total': instance.total,
    };
