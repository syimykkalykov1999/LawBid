// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'search_query_stat_dto.g.dart';

@JsonSerializable()
class SearchQueryStatDto {
  const SearchQueryStatDto({
    required this.q,
    required this.count,
    required this.people,
    required this.scopes,
    required this.lastAt,
  });

  factory SearchQueryStatDto.fromJson(Map<String, Object?> json) =>
      _$SearchQueryStatDtoFromJson(json);

  final String q;
  final num count;

  /// Different people who asked.
  final num people;
  final List<String> scopes;
  final String lastAt;

  Map<String, Object?> toJson() => _$SearchQueryStatDtoToJson(this);
}
