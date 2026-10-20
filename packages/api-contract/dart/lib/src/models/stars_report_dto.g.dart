// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsReportDto _$StarsReportDtoFromJson(Map<String, dynamic> json) =>
    StarsReportDto(
      days: (json['days'] as num).toInt(),
      starsSold: (json['starsSold'] as num).toInt(),
      revenueCents: (json['revenueCents'] as num).toInt(),
      purchases: (json['purchases'] as num).toInt(),
      starsSpent: (json['starsSpent'] as num).toInt(),
      outstandingStars: (json['outstandingStars'] as num).toInt(),
      giftsSent: (json['giftsSent'] as num).toInt(),
      starsConverted: (json['starsConverted'] as num).toInt(),
      byKind: (json['byKind'] as List<dynamic>)
          .map((e) => StarsKindTotalDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      topGifts: (json['topGifts'] as List<dynamic>)
          .map((e) => StarsTopGiftDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StarsReportDtoToJson(StarsReportDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'starsSold': instance.starsSold,
      'revenueCents': instance.revenueCents,
      'purchases': instance.purchases,
      'starsSpent': instance.starsSpent,
      'outstandingStars': instance.outstandingStars,
      'giftsSent': instance.giftsSent,
      'starsConverted': instance.starsConverted,
      'byKind': instance.byKind.map((e) => e.toJson()).toList(),
      'topGifts': instance.topGifts.map((e) => e.toJson()).toList(),
    };
