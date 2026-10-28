// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_terms_dto_currency.dart';
import 'payment_terms_dto_installment_period.dart';
import 'payment_terms_dto_type.dart';

part 'payment_terms_dto.g.dart';

@JsonSerializable()
class PaymentTermsDto {
  const PaymentTermsDto({
    required this.version,
    required this.type,
    required this.currency,
    this.flatCents,
    this.hourlyRateCents,
    this.estimatedHoursMin,
    this.estimatedHoursMax,
    this.contingencyBps,
    this.retainerCents,
    this.installmentCents,
    this.installmentCount,
    this.installmentPeriod,
    this.notes,
  });

  factory PaymentTermsDto.fromJson(Map<String, Object?> json) =>
      _$PaymentTermsDtoFromJson(json);

  final int version;
  final PaymentTermsDtoType type;
  final PaymentTermsDtoCurrency currency;
  final int? flatCents;
  final int? hourlyRateCents;
  final int? estimatedHoursMin;
  final int? estimatedHoursMax;
  final int? contingencyBps;
  final int? retainerCents;
  final int? installmentCents;
  final int? installmentCount;
  final PaymentTermsDtoInstallmentPeriod? installmentPeriod;
  final String? notes;

  Map<String, Object?> toJson() => _$PaymentTermsDtoToJson(this);
}
