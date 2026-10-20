// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'convert_gift_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConvertGiftResultDto _$ConvertGiftResultDtoFromJson(
  Map<String, dynamic> json,
) => ConvertGiftResultDto(
  stars: (json['stars'] as num).toInt(),
  balance: (json['balance'] as num).toInt(),
);

Map<String, dynamic> _$ConvertGiftResultDtoToJson(
  ConvertGiftResultDto instance,
) => <String, dynamic>{'stars': instance.stars, 'balance': instance.balance};
