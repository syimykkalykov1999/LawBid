// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_stats_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineStatsDayDto _$HotlineStatsDayDtoFromJson(Map<String, dynamic> json) =>
    HotlineStatsDayDto(
      day: json['day'] as String,
      calls: json['calls'] as num,
      talkSeconds: json['talkSeconds'] as num,
      casesOffered: json['casesOffered'] as num,
      reviews: json['reviews'] as num,
      starsSum: json['starsSum'] as num,
      clients: json['clients'] as num,
      attorneys: json['attorneys'] as num,
    );

Map<String, dynamic> _$HotlineStatsDayDtoToJson(HotlineStatsDayDto instance) =>
    <String, dynamic>{
      'day': instance.day,
      'calls': instance.calls,
      'talkSeconds': instance.talkSeconds,
      'casesOffered': instance.casesOffered,
      'reviews': instance.reviews,
      'starsSum': instance.starsSum,
      'clients': instance.clients,
      'attorneys': instance.attorneys,
    };
