// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gift_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GiftDto _$GiftDtoFromJson(Map<String, dynamic> json) => GiftDto(
  id: json['id'] as String,
  title: json['title'] as String,
  code: json['code'] as String?,
  priceStars: (json['priceStars'] as num).toInt(),
  url: json['url'] as String?,
);

Map<String, dynamic> _$GiftDtoToJson(GiftDto instance) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'code': ?instance.code,
  'priceStars': instance.priceStars,
  'url': ?instance.url,
};
