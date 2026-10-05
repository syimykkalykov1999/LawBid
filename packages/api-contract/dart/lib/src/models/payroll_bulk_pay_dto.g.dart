// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_bulk_pay_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollBulkPayDto _$PayrollBulkPayDtoFromJson(Map<String, dynamic> json) =>
    PayrollBulkPayDto(
      employeeIds: (json['employeeIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      period: json['period'] as String,
      amounts: (json['amounts'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, (e as num).toInt()),
      ),
      note: json['note'] as String?,
      method: json['method'] == null
          ? PayrollBulkPayDtoMethod.manual
          : PayrollBulkPayDtoMethod.fromJson(json['method'] as String),
    );

Map<String, dynamic> _$PayrollBulkPayDtoToJson(PayrollBulkPayDto instance) =>
    <String, dynamic>{
      'employeeIds': instance.employeeIds,
      'period': instance.period,
      'method': instance.method.toJson(),
      'amounts': ?instance.amounts,
      'note': ?instance.note,
    };
