// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_gift_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateGiftDto _$CreateGiftDtoFromJson(Map<String, dynamic> json) =>
    CreateGiftDto(
      title: json['title'] as String,
      priceStars: (json['priceStars'] as num).toInt(),
      fileId: json['fileId'] as String,
    );

Map<String, dynamic> _$CreateGiftDtoToJson(CreateGiftDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'priceStars': instance.priceStars,
      'fileId': instance.fileId,
    };
