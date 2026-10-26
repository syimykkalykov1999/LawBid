// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsOverviewDto _$StarsOverviewDtoFromJson(Map<String, dynamic> json) =>
    StarsOverviewDto(
      enabled: json['enabled'] as bool,
      balance: (json['balance'] as num).toInt(),
      packs: (json['packs'] as List<dynamic>)
          .map((e) => StarPackDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      giftConvertPercent: (json['giftConvertPercent'] as num).toInt(),
      starCents: (json['starCents'] as num).toInt(),
      reactionStars: (json['reactionStars'] as num).toInt(),
      premiumReactions: (json['premiumReactions'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      freeReactions: (json['freeReactions'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$StarsOverviewDtoToJson(StarsOverviewDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'balance': instance.balance,
      'packs': instance.packs.map((e) => e.toJson()).toList(),
      'giftConvertPercent': instance.giftConvertPercent,
      'starCents': instance.starCents,
      'reactionStars': instance.reactionStars,
      'premiumReactions': instance.premiumReactions,
      'freeReactions': instance.freeReactions,
    };
