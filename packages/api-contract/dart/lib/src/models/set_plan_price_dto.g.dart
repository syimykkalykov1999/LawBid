// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_plan_price_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetPlanPriceDto _$SetPlanPriceDtoFromJson(Map<String, dynamic> json) =>
    SetPlanPriceDto(
      amountCents: (json['amountCents'] as num).toInt(),
      note: json['note'] as String?,
      compareAtCents: (json['compareAtCents'] as num?)?.toInt(),
      showDiscount: json['showDiscount'] as bool?,
    );

Map<String, dynamic> _$SetPlanPriceDtoToJson(SetPlanPriceDto instance) =>
    <String, dynamic>{
      'amountCents': instance.amountCents,
      'note': ?instance.note,
      'compareAtCents': ?instance.compareAtCents,
      'showDiscount': ?instance.showDiscount,
    };
