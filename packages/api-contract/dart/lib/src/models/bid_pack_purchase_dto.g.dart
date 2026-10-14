// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_pack_purchase_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPackPurchaseDto _$BidPackPurchaseDtoFromJson(Map<String, dynamic> json) =>
    BidPackPurchaseDto(
      status: BidPackPurchaseDtoStatus.fromJson(json['status'] as String),
      bids: (json['bids'] as num).toInt(),
      balance: (json['balance'] as num).toInt(),
    );

Map<String, dynamic> _$BidPackPurchaseDtoToJson(BidPackPurchaseDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'bids': instance.bids,
      'balance': instance.balance,
    };
