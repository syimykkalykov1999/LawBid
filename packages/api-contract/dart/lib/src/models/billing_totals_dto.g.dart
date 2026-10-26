// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billing_totals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillingTotalsDto _$BillingTotalsDtoFromJson(Map<String, dynamic> json) =>
    BillingTotalsDto(
      minutes: json['minutes'] as num,
      timeCents: json['timeCents'] as num,
      expensesCents: json['expensesCents'] as num,
      totalCents: json['totalCents'] as num,
    );

Map<String, dynamic> _$BillingTotalsDtoToJson(BillingTotalsDto instance) =>
    <String, dynamic>{
      'minutes': instance.minutes,
      'timeCents': instance.timeCents,
      'expensesCents': instance.expensesCents,
      'totalCents': instance.totalCents,
    };
