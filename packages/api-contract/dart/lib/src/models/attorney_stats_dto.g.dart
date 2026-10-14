// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyStatsDto _$AttorneyStatsDtoFromJson(Map<String, dynamic> json) =>
    AttorneyStatsDto(
      profileViews30d: (json['profileViews30d'] as num).toInt(),
      bidsSent30d: (json['bidsSent30d'] as num).toInt(),
      bidsAccepted30d: (json['bidsAccepted30d'] as num).toInt(),
      clientsTotal: (json['clientsTotal'] as num).toInt(),
    );

Map<String, dynamic> _$AttorneyStatsDtoToJson(AttorneyStatsDto instance) =>
    <String, dynamic>{
      'profileViews30d': instance.profileViews30d,
      'bidsSent30d': instance.bidsSent30d,
      'bidsAccepted30d': instance.bidsAccepted30d,
      'clientsTotal': instance.clientsTotal,
    };
