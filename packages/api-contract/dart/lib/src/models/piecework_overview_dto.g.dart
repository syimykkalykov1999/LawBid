// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkOverviewDto _$PieceworkOverviewDtoFromJson(
  Map<String, dynamic> json,
) => PieceworkOverviewDto(
  period: json['period'] as String,
  scope: PieceworkOverviewDtoScope.fromJson(json['scope'] as String),
  currency: json['currency'] as String,
  totals: PieceworkTotalsDto.fromJson(json['totals'] as Map<String, dynamic>),
  people: (json['people'] as List<dynamic>)
      .map((e) => PieceworkPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PieceworkOverviewDtoToJson(
  PieceworkOverviewDto instance,
) => <String, dynamic>{
  'period': instance.period,
  'scope': instance.scope.toJson(),
  'currency': instance.currency,
  'totals': instance.totals.toJson(),
  'people': instance.people.map((e) => e.toJson()).toList(),
};
