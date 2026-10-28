// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_terms_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentTermsDto _$PaymentTermsDtoFromJson(Map<String, dynamic> json) =>
    PaymentTermsDto(
      version: (json['version'] as num).toInt(),
      type: PaymentTermsDtoType.fromJson(json['type'] as String),
      currency: PaymentTermsDtoCurrency.fromJson(json['currency'] as String),
      flatCents: (json['flatCents'] as num?)?.toInt(),
      hourlyRateCents: (json['hourlyRateCents'] as num?)?.toInt(),
      estimatedHoursMin: (json['estimatedHoursMin'] as num?)?.toInt(),
      estimatedHoursMax: (json['estimatedHoursMax'] as num?)?.toInt(),
      contingencyBps: (json['contingencyBps'] as num?)?.toInt(),
      retainerCents: (json['retainerCents'] as num?)?.toInt(),
      installmentCents: (json['installmentCents'] as num?)?.toInt(),
      installmentCount: (json['installmentCount'] as num?)?.toInt(),
      installmentPeriod: json['installmentPeriod'] == null
          ? null
          : PaymentTermsDtoInstallmentPeriod.fromJson(
              json['installmentPeriod'] as String,
            ),
      notes: json['notes'] as String?,
    );

Map<String, dynamic> _$PaymentTermsDtoToJson(PaymentTermsDto instance) =>
    <String, dynamic>{
      'version': instance.version,
      'type': instance.type.toJson(),
      'currency': instance.currency.toJson(),
      'flatCents': ?instance.flatCents,
      'hourlyRateCents': ?instance.hourlyRateCents,
      'estimatedHoursMin': ?instance.estimatedHoursMin,
      'estimatedHoursMax': ?instance.estimatedHoursMax,
      'contingencyBps': ?instance.contingencyBps,
      'retainerCents': ?instance.retainerCents,
      'installmentCents': ?instance.installmentCents,
      'installmentCount': ?instance.installmentCount,
      'installmentPeriod': ?instance.installmentPeriod?.toJson(),
      'notes': ?instance.notes,
    };
