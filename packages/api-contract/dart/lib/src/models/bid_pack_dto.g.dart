// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPackDto _$BidPackDtoFromJson(Map<String, dynamic> json) => BidPackDto(
  id: json['id'] as String,
  bids: (json['bids'] as num).toInt(),
  priceCents: (json['priceCents'] as num).toInt(),
);

Map<String, dynamic> _$BidPackDtoToJson(BidPackDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'bids': instance.bids,
      'priceCents': instance.priceCents,
    };
