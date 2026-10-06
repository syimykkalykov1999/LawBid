// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_payroll_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryPayrollDto _$TreasuryPayrollDtoFromJson(Map<String, dynamic> json) =>
    TreasuryPayrollDto(
      stripeReady: json['stripeReady'] as bool,
      nextPayAt: DateTime.parse(json['nextPayAt'] as String),
      paidThisPeriod: json['paidThisPeriod'] as bool,
      dueCents: (json['dueCents'] as num).toInt(),
      people: (json['people'] as num).toInt(),
      notLinked: (json['notLinked'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      shortCents: (json['shortCents'] as num).toInt(),
    );

Map<String, dynamic> _$TreasuryPayrollDtoToJson(TreasuryPayrollDto instance) =>
    <String, dynamic>{
      'stripeReady': instance.stripeReady,
      'nextPayAt': instance.nextPayAt.toIso8601String(),
      'paidThisPeriod': instance.paidThisPeriod,
      'dueCents': instance.dueCents,
      'people': instance.people,
      'notLinked': instance.notLinked,
      'shortCents': instance.shortCents,
    };
