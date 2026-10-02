// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_quote_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionQuoteDto _$PromotionQuoteDtoFromJson(Map<String, dynamic> json) =>
    PromotionQuoteDto(
      days: (json['days'] as num).toInt(),
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      grossCents: (json['grossCents'] as num).toInt(),
      totalCents: (json['totalCents'] as num).toInt(),
      creditDaysAvailable: (json['creditDaysAvailable'] as num).toInt(),
      creditDaysUsed: (json['creditDaysUsed'] as num).toInt(),
      maxDays: (json['maxDays'] as num).toInt(),
      enabled: json['enabled'] as bool,
    );

Map<String, dynamic> _$PromotionQuoteDtoToJson(PromotionQuoteDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'priceCentsPerDay': instance.priceCentsPerDay,
      'grossCents': instance.grossCents,
      'totalCents': instance.totalCents,
      'creditDaysAvailable': instance.creditDaysAvailable,
      'creditDaysUsed': instance.creditDaysUsed,
      'maxDays': instance.maxDays,
      'enabled': instance.enabled,
    };
