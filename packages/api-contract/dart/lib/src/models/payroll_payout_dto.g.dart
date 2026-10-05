// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_payout_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollPayoutDto _$PayrollPayoutDtoFromJson(Map<String, dynamic> json) =>
    PayrollPayoutDto(
      id: json['id'] as String,
      employeeId: json['employeeId'] as String,
      employeeName: json['employeeName'] as String,
      batchId: json['batchId'] as String,
      period: json['period'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      baseCents: (json['baseCents'] as num).toInt(),
      commissionCents: (json['commissionCents'] as num).toInt(),
      feeCents: (json['feeCents'] as num).toInt(),
      netCents: (json['netCents'] as num).toInt(),
      currency: json['currency'] as String,
      method: PayrollPayoutDtoMethod.fromJson(json['method'] as String),
      status: PayrollPayoutDtoStatus.fromJson(json['status'] as String),
      createdAt: json['createdAt'] as String,
      note: json['note'] as String?,
      transferId: json['transferId'] as String?,
      failure: json['failure'] as String?,
      cancelReason: json['cancelReason'] as String?,
    );

Map<String, dynamic> _$PayrollPayoutDtoToJson(PayrollPayoutDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'employeeId': instance.employeeId,
      'employeeName': instance.employeeName,
      'batchId': instance.batchId,
      'period': instance.period,
      'amountCents': instance.amountCents,
      'baseCents': instance.baseCents,
      'commissionCents': instance.commissionCents,
      'feeCents': instance.feeCents,
      'netCents': instance.netCents,
      'currency': instance.currency,
      'method': instance.method.toJson(),
      'status': instance.status.toJson(),
      'note': ?instance.note,
      'transferId': ?instance.transferId,
      'failure': ?instance.failure,
      'cancelReason': ?instance.cancelReason,
      'createdAt': instance.createdAt,
    };
