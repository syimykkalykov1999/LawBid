// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'search_overview_dto.g.dart';

@JsonSerializable()
class SearchOverviewDto {
  const SearchOverviewDto({
    required this.queries,
    required this.noResults,
    required this.clicks,
  });

  factory SearchOverviewDto.fromJson(Map<String, Object?> json) =>
      _$SearchOverviewDtoFromJson(json);

  /// Queries in the period.
  final num queries;

  /// Of them found nothing.
  final num noResults;

  /// Results opened after a query.
  final num clicks;

  Map<String, Object?> toJson() => _$SearchOverviewDtoToJson(this);
}
