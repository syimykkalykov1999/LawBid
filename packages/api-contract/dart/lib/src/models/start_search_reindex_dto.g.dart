// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'start_search_reindex_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StartSearchReindexDto _$StartSearchReindexDtoFromJson(
  Map<String, dynamic> json,
) => StartSearchReindexDto(
  source: json['source'] == null
      ? null
      : StartSearchReindexDtoSource.fromJson(json['source'] as String),
);

Map<String, dynamic> _$StartSearchReindexDtoToJson(
  StartSearchReindexDto instance,
) => <String, dynamic>{'source': ?instance.source?.toJson()};
