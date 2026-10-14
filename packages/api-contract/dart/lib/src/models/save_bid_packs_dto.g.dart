// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_bid_packs_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveBidPacksDto _$SaveBidPacksDtoFromJson(Map<String, dynamic> json) =>
    SaveBidPacksDto(
      packs: (json['packs'] as List<dynamic>)
          .map((e) => BidPackDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$SaveBidPacksDtoToJson(SaveBidPacksDto instance) =>
    <String, dynamic>{'packs': instance.packs.map((e) => e.toJson()).toList()};
