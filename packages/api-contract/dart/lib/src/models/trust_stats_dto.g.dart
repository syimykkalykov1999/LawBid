// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustStatsDto _$TrustStatsDtoFromJson(Map<String, dynamic> json) =>
    TrustStatsDto(
      byLevel: (json['byLevel'] as List<dynamic>)
          .map((e) => TrustLevelCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      held: (json['held'] as num).toInt(),
      withBadge: (json['withBadge'] as num).toInt(),
      verified: (json['verified'] as num).toInt(),
      complaints30d: (json['complaints30d'] as num).toInt(),
      cleared: (json['cleared'] as num).toInt(),
      inQueue: (json['inQueue'] as num).toInt(),
      enabled: json['enabled'] as bool,
      manualReview: json['manualReview'] as bool,
      byStatus: (json['byStatus'] as List<dynamic>)
          .map((e) => TrustStatusCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      blockedBarNumbers: (json['blockedBarNumbers'] as num).toInt(),
    );

Map<String, dynamic> _$TrustStatsDtoToJson(TrustStatsDto instance) =>
    <String, dynamic>{
      'byLevel': instance.byLevel.map((e) => e.toJson()).toList(),
      'held': instance.held,
      'withBadge': instance.withBadge,
      'verified': instance.verified,
      'complaints30d': instance.complaints30d,
      'cleared': instance.cleared,
      'inQueue': instance.inQueue,
      'enabled': instance.enabled,
      'manualReview': instance.manualReview,
      'byStatus': instance.byStatus.map((e) => e.toJson()).toList(),
      'blockedBarNumbers': instance.blockedBarNumbers,
    };
