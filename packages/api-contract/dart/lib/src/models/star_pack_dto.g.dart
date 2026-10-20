// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'star_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarPackDto _$StarPackDtoFromJson(Map<String, dynamic> json) => StarPackDto(
  id: json['id'] as String,
  stars: (json['stars'] as num).toInt(),
  priceCents: (json['priceCents'] as num).toInt(),
);

Map<String, dynamic> _$StarPackDtoToJson(StarPackDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'stars': instance.stars,
      'priceCents': instance.priceCents,
    };
