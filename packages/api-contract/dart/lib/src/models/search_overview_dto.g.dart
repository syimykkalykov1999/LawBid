// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchOverviewDto _$SearchOverviewDtoFromJson(Map<String, dynamic> json) =>
    SearchOverviewDto(
      queries: json['queries'] as num,
      noResults: json['noResults'] as num,
      clicks: json['clicks'] as num,
    );

Map<String, dynamic> _$SearchOverviewDtoToJson(SearchOverviewDto instance) =>
    <String, dynamic>{
      'queries': instance.queries,
      'noResults': instance.noResults,
      'clicks': instance.clicks,
    };
