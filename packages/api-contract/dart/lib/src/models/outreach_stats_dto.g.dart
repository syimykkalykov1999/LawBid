// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachStatsDto _$OutreachStatsDtoFromJson(Map<String, dynamic> json) =>
    OutreachStatsDto(
      from: DateTime.parse(json['from'] as String),
      to: DateTime.parse(json['to'] as String),
      partners: (json['partners'] as List<dynamic>)
          .map(
            (e) => OutreachPartnerStatsDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      totals: OutreachPartnerStatsDto.fromJson(
        json['totals'] as Map<String, dynamic>,
      ),
      byStatus: Map<String, num>.from(json['byStatus'] as Map),
    );

Map<String, dynamic> _$OutreachStatsDtoToJson(OutreachStatsDto instance) =>
    <String, dynamic>{
      'from': instance.from.toIso8601String(),
      'to': instance.to.toIso8601String(),
      'partners': instance.partners.map((e) => e.toJson()).toList(),
      'totals': instance.totals.toJson(),
      'byStatus': instance.byStatus,
    };
