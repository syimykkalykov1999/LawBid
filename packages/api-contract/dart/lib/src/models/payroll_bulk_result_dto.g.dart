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
  fees: Map<String, int>.from(json['fees'] as Map),
  net: Map<String, int>.from(json['net'] as Map),
  commissions: Map<String, int>.from(json['commissions'] as Map),
  alreadyPaid: (json['alreadyPaid'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  nothingOwed: (json['nothingOwed'] as List<dynamic>)
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
  'fees': instance.fees,
  'net': instance.net,
  'commissions': instance.commissions,
  'alreadyPaid': instance.alreadyPaid,
  'nothingOwed': instance.nothingOwed,
  'failed': instance.failed,
};
