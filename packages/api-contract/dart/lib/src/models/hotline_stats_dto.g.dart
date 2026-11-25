// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineStatsDto _$HotlineStatsDtoFromJson(Map<String, dynamic> json) =>
    HotlineStatsDto(
      computedAt: json['computedAt'] as String,
      days: (json['days'] as List<dynamic>)
          .map((e) => HotlineStatsDayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      totals: HotlineStatsTotalsDto.fromJson(
        json['totals'] as Map<String, dynamic>,
      ),
      states: (json['states'] as List<dynamic>)
          .map((e) => HotlineStatsRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      practices: (json['practices'] as List<dynamic>)
          .map((e) => HotlineStatsRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      endReasons: (json['endReasons'] as List<dynamic>)
          .map((e) => HotlineStatsRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$HotlineStatsDtoToJson(HotlineStatsDto instance) =>
    <String, dynamic>{
      'computedAt': instance.computedAt,
      'days': instance.days.map((e) => e.toJson()).toList(),
      'totals': instance.totals.toJson(),
      'states': instance.states.map((e) => e.toJson()).toList(),
      'practices': instance.practices.map((e) => e.toJson()).toList(),
      'endReasons': instance.endReasons.map((e) => e.toJson()).toList(),
    };
