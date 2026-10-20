// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_top_gift_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsTopGiftDto _$StarsTopGiftDtoFromJson(Map<String, dynamic> json) =>
    StarsTopGiftDto(
      title: json['title'] as String,
      sent: (json['sent'] as num).toInt(),
      stars: (json['stars'] as num).toInt(),
    );

Map<String, dynamic> _$StarsTopGiftDtoToJson(StarsTopGiftDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'sent': instance.sent,
      'stars': instance.stars,
    };
