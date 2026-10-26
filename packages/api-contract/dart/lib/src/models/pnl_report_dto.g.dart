// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pnl_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PnlReportDto _$PnlReportDtoFromJson(Map<String, dynamic> json) => PnlReportDto(
  computedAt: json['computedAt'] as String?,
  asOf: json['asOf'] as String?,
  today: json['today'] == null
      ? null
      : PnlPeriodDto.fromJson(json['today'] as Map<String, dynamic>),
  week: json['week'] == null
      ? null
      : PnlPeriodDto.fromJson(json['week'] as Map<String, dynamic>),
  month: json['month'] == null
      ? null
      : PnlPeriodDto.fromJson(json['month'] as Map<String, dynamic>),
  weeks: (json['weeks'] as List<dynamic>)
      .map((e) => PnlWeekDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  days: (json['days'] as List<dynamic>)
      .map((e) => PnlDayDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  byKind: (json['byKind'] as List<dynamic>)
      .map((e) => PnlKindLineDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  vendorDataFrom: json['vendorDataFrom'] as String?,
);

Map<String, dynamic> _$PnlReportDtoToJson(PnlReportDto instance) =>
    <String, dynamic>{
      'computedAt': ?instance.computedAt,
      'asOf': ?instance.asOf,
      'today': ?instance.today?.toJson(),
      'week': ?instance.week?.toJson(),
      'month': ?instance.month?.toJson(),
      'weeks': instance.weeks.map((e) => e.toJson()).toList(),
      'days': instance.days.map((e) => e.toJson()).toList(),
      'byKind': instance.byKind.map((e) => e.toJson()).toList(),
      'vendorDataFrom': ?instance.vendorDataFrom,
    };
