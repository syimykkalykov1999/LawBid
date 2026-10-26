// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_accrual_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollAccrualDto _$PayrollAccrualDtoFromJson(Map<String, dynamic> json) =>
    PayrollAccrualDto(
      id: json['id'] as String,
      employeeId: json['employeeId'] as String,
      source: json['source'] as String,
      kind: PayrollAccrualDtoKind.fromJson(json['kind'] as String),
      eventRef: json['eventRef'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String,
      period: json['period'] as String,
      status: PayrollAccrualDtoStatus.fromJson(json['status'] as String),
      createdAt: json['createdAt'] as String,
      note: json['note'] as String?,
      payoutId: json['payoutId'] as String?,
    );

Map<String, dynamic> _$PayrollAccrualDtoToJson(PayrollAccrualDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'employeeId': instance.employeeId,
      'source': instance.source,
      'kind': instance.kind.toJson(),
      'eventRef': instance.eventRef,
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'period': instance.period,
      'note': ?instance.note,
      'status': instance.status.toJson(),
      'payoutId': ?instance.payoutId,
      'createdAt': instance.createdAt,
    };
