// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_pack_buy_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPackBuyDto _$BidPackBuyDtoFromJson(Map<String, dynamic> json) =>
    BidPackBuyDto(
      purchaseId: json['purchaseId'] as String,
      checkoutUrl: json['checkoutUrl'] as String,
    );

Map<String, dynamic> _$BidPackBuyDtoToJson(BidPackBuyDto instance) =>
    <String, dynamic>{
      'purchaseId': instance.purchaseId,
      'checkoutUrl': instance.checkoutUrl,
    };
