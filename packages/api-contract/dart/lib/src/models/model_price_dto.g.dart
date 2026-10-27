// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'model_price_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModelPriceDto _$ModelPriceDtoFromJson(Map<String, dynamic> json) =>
    ModelPriceDto(
      enabled: json['enabled'] as bool,
      priceCents: (json['priceCents'] as num).toInt(),
    );

Map<String, dynamic> _$ModelPriceDtoToJson(ModelPriceDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'priceCents': instance.priceCents,
    };
