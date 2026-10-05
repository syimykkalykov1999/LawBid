// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_bulk_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollBulkResultDto _$PayrollBulkResultDtoFromJson(
  Map<String, dynamic> json,
) => PayrollBulkResultDto(
  batchId: json['batchId'] as String,
  count: (json['count'] as num).toInt(),
  totals: Map<String, int>.from(json['totals'] as Map),
  alreadyPaid: (json['alreadyPaid'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  failed: (json['failed'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$PayrollBulkResultDtoToJson(
  PayrollBulkResultDto instance,
) => <String, dynamic>{
  'batchId': instance.batchId,
  'count': instance.count,
  'totals': instance.totals,
  'alreadyPaid': instance.alreadyPaid,
  'failed': instance.failed,
};
