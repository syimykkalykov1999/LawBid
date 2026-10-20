// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_billing_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseBillingDto _$CaseBillingDtoFromJson(Map<String, dynamic> json) =>
    CaseBillingDto(
      role: CaseBillingDtoRole.fromJson(json['role'] as String),
      canEdit: json['canEdit'] as bool,
      currency: json['currency'] as String,
      hourlyRateCents: json['hourlyRateCents'] as num?,
      timer: json['timer'] == null
          ? null
          : RunningTimerDto.fromJson(json['timer'] as Map<String, dynamic>),
      entries: (json['entries'] as List<dynamic>)
          .map((e) => TimeEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      expenses: (json['expenses'] as List<dynamic>)
          .map((e) => ExpenseDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      unbilled: BillingTotalsDto.fromJson(
        json['unbilled'] as Map<String, dynamic>,
      ),
      invoices: (json['invoices'] as List<dynamic>)
          .map((e) => InvoiceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CaseBillingDtoToJson(CaseBillingDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'canEdit': instance.canEdit,
      'currency': instance.currency,
      'hourlyRateCents': ?instance.hourlyRateCents,
      'timer': ?instance.timer?.toJson(),
      'entries': instance.entries.map((e) => e.toJson()).toList(),
      'expenses': instance.expenses.map((e) => e.toJson()).toList(),
      'unbilled': instance.unbilled.toJson(),
      'invoices': instance.invoices.map((e) => e.toJson()).toList(),
    };
