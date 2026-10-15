// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_query_stat_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchQueryStatDto _$SearchQueryStatDtoFromJson(Map<String, dynamic> json) =>
    SearchQueryStatDto(
      q: json['q'] as String,
      count: json['count'] as num,
      people: json['people'] as num,
      scopes: (json['scopes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      lastAt: json['lastAt'] as String,
    );

Map<String, dynamic> _$SearchQueryStatDtoToJson(SearchQueryStatDto instance) =>
    <String, dynamic>{
      'q': instance.q,
      'count': instance.count,
      'people': instance.people,
      'scopes': instance.scopes,
      'lastAt': instance.lastAt,
    };
