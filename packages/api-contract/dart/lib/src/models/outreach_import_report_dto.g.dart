// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_import_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachImportReportDto _$OutreachImportReportDtoFromJson(
  Map<String, dynamic> json,
) => OutreachImportReportDto(
  mode: OutreachImportReportDtoMode.fromJson(json['mode'] as String),
  rows: json['rows'] as num,
  created: json['created'] as num,
  duplicates: json['duplicates'] as num,
  suppressed: json['suppressed'] as num,
  skipped: json['skipped'] as num,
  columns: (json['columns'] as List<dynamic>).map((e) => e as String).toList(),
  problems: (json['problems'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$OutreachImportReportDtoToJson(
  OutreachImportReportDto instance,
) => <String, dynamic>{
  'mode': instance.mode.toJson(),
  'rows': instance.rows,
  'created': instance.created,
  'duplicates': instance.duplicates,
  'suppressed': instance.suppressed,
  'skipped': instance.skipped,
  'columns': instance.columns,
  'problems': instance.problems,
};
