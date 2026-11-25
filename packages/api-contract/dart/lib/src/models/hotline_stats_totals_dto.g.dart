// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_stats_totals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineStatsTotalsDto _$HotlineStatsTotalsDtoFromJson(
  Map<String, dynamic> json,
) => HotlineStatsTotalsDto(
  calls: json['calls'] as num,
  talkSeconds: json['talkSeconds'] as num,
  casesOffered: json['casesOffered'] as num,
  reviews: json['reviews'] as num,
  starsSum: json['starsSum'] as num,
  clients: json['clients'] as num,
  attorneys: json['attorneys'] as num,
);

Map<String, dynamic> _$HotlineStatsTotalsDtoToJson(
  HotlineStatsTotalsDto instance,
) => <String, dynamic>{
  'calls': instance.calls,
  'talkSeconds': instance.talkSeconds,
  'casesOffered': instance.casesOffered,
  'reviews': instance.reviews,
  'starsSum': instance.starsSum,
  'clients': instance.clients,
  'attorneys': instance.attorneys,
};
