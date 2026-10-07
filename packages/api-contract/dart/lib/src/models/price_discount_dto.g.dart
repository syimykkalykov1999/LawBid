// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'price_discount_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PriceDiscountDto _$PriceDiscountDtoFromJson(Map<String, dynamic> json) =>
    PriceDiscountDto(
      compareAtCents: (json['compareAtCents'] as num).toInt(),
      percent: (json['percent'] as num).toInt(),
    );

Map<String, dynamic> _$PriceDiscountDtoToJson(PriceDiscountDto instance) =>
    <String, dynamic>{
      'compareAtCents': instance.compareAtCents,
      'percent': instance.percent,
    };
