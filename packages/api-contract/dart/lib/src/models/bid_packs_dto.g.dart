// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_packs_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPacksDto _$BidPacksDtoFromJson(Map<String, dynamic> json) => BidPacksDto(
  enabled: json['enabled'] as bool,
  balance: (json['balance'] as num).toInt(),
  packs: (json['packs'] as List<dynamic>)
      .map((e) => BidPackDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$BidPacksDtoToJson(BidPacksDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'balance': instance.balance,
      'packs': instance.packs.map((e) => e.toJson()).toList(),
    };
