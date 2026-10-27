// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayDto _$StaffTodayDtoFromJson(Map<String, dynamic> json) =>
    StaffTodayDto(
      computedAt: DateTime.parse(json['computedAt'] as String),
      decision: json['decision'] == null
          ? null
          : StaffDecisionOfDayDto.fromJson(
              json['decision'] as Map<String, dynamic>,
            ),
      appeals: json['appeals'] == null
          ? null
          : StaffTodayAppealsDto.fromJson(
              json['appeals'] as Map<String, dynamic>,
            ),
      flags: json['flags'] == null
          ? null
          : StaffTodayFlagsDto.fromJson(json['flags'] as Map<String, dynamic>),
      shortlist: json['shortlist'] == null
          ? null
          : StaffTodayShortlistDto.fromJson(
              json['shortlist'] as Map<String, dynamic>,
            ),
      suggestions: json['suggestions'] == null
          ? null
          : StaffTodaySuggestionsDto.fromJson(
              json['suggestions'] as Map<String, dynamic>,
            ),
      anomalies: json['anomalies'] == null
          ? null
          : StaffTodayAnomaliesDto.fromJson(
              json['anomalies'] as Map<String, dynamic>,
            ),
      piecework: json['piecework'] == null
          ? null
          : StaffTodayPieceworkDto.fromJson(
              json['piecework'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$StaffTodayDtoToJson(StaffTodayDto instance) =>
    <String, dynamic>{
      'computedAt': instance.computedAt.toIso8601String(),
      'decision': ?instance.decision?.toJson(),
      'appeals': ?instance.appeals?.toJson(),
      'flags': ?instance.flags?.toJson(),
      'shortlist': ?instance.shortlist?.toJson(),
      'suggestions': ?instance.suggestions?.toJson(),
      'anomalies': ?instance.anomalies?.toJson(),
      'piecework': ?instance.piecework?.toJson(),
    };
