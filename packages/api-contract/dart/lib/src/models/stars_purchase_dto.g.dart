// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_purchase_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsPurchaseDto _$StarsPurchaseDtoFromJson(Map<String, dynamic> json) =>
    StarsPurchaseDto(
      status: StarsPurchaseDtoStatus.fromJson(json['status'] as String),
      stars: (json['stars'] as num).toInt(),
      balance: (json['balance'] as num).toInt(),
    );

Map<String, dynamic> _$StarsPurchaseDtoToJson(StarsPurchaseDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'stars': instance.stars,
      'balance': instance.balance,
    };
