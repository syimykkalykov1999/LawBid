// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollSummaryDto _$PayrollSummaryDtoFromJson(Map<String, dynamic> json) =>
    PayrollSummaryDto(
      period: json['period'] as String,
      activeEmployees: (json['activeEmployees'] as num).toInt(),
      monthly: Map<String, int>.from(json['monthly'] as Map),
      paid: Map<String, int>.from(json['paid'] as Map),
      unpaidEmployees: (json['unpaidEmployees'] as num).toInt(),
      stripeAvailable: json['stripeAvailable'] as bool,
      pending: Map<String, int>.from(json['pending'] as Map),
      stripeFees: PayrollFeeSettingsDto.fromJson(
        json['stripeFees'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$PayrollSummaryDtoToJson(PayrollSummaryDto instance) =>
    <String, dynamic>{
      'period': instance.period,
      'activeEmployees': instance.activeEmployees,
      'monthly': instance.monthly,
      'paid': instance.paid,
      'unpaidEmployees': instance.unpaidEmployees,
      'stripeAvailable': instance.stripeAvailable,
      'pending': instance.pending,
      'stripeFees': instance.stripeFees.toJson(),
    };
