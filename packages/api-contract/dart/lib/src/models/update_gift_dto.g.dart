// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_gift_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateGiftDto _$UpdateGiftDtoFromJson(Map<String, dynamic> json) =>
    UpdateGiftDto(
      title: json['title'] as String?,
      priceStars: (json['priceStars'] as num?)?.toInt(),
      position: (json['position'] as num?)?.toInt(),
      status: json['status'] == null
          ? null
          : UpdateGiftDtoStatus.fromJson(json['status'] as String),
    );

Map<String, dynamic> _$UpdateGiftDtoToJson(UpdateGiftDto instance) =>
    <String, dynamic>{
      'title': ?instance.title,
      'priceStars': ?instance.priceStars,
      'position': ?instance.position,
      'status': ?instance.status?.toJson(),
    };
