// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'price_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PriceDto _$PriceDtoFromJson(Map<String, dynamic> json) => PriceDto(
  key: json['key'] as String,
  label: json['label'] as String,
  unit: json['unit'] as String,
  value: json['value'] as num,
  defaultValue: json['defaultValue'] as num,
  edited: json['edited'] as bool,
  sourceUrl: json['sourceUrl'] as String,
  checkedAt: json['checkedAt'] as String,
);

Map<String, dynamic> _$PriceDtoToJson(PriceDto instance) => <String, dynamic>{
  'key': instance.key,
  'label': instance.label,
  'unit': instance.unit,
  'value': instance.value,
  'defaultValue': instance.defaultValue,
  'edited': instance.edited,
  'sourceUrl': instance.sourceUrl,
  'checkedAt': instance.checkedAt,
};
