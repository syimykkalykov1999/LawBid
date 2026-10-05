// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_payroll_accrual_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePayrollAccrualDto _$CreatePayrollAccrualDtoFromJson(
  Map<String, dynamic> json,
) => CreatePayrollAccrualDto(
  kind: CreatePayrollAccrualDtoKind.fromJson(json['kind'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  period: json['period'] as String,
  note: json['note'] as String,
);

Map<String, dynamic> _$CreatePayrollAccrualDtoToJson(
  CreatePayrollAccrualDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'amountCents': instance.amountCents,
  'period': instance.period,
  'note': instance.note,
};
