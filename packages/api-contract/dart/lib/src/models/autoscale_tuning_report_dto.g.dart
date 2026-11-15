// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'autoscale_tuning_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoscaleTuningReportDto _$AutoscaleTuningReportDtoFromJson(
  Map<String, dynamic> json,
) => AutoscaleTuningReportDto(
  targets: (json['targets'] as List<dynamic>)
      .map((e) => AutoscaleTuningTargetDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AutoscaleTuningReportDtoToJson(
  AutoscaleTuningReportDto instance,
) => <String, dynamic>{
  'targets': instance.targets.map((e) => e.toJson()).toList(),
};
