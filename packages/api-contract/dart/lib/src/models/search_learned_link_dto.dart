// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'search_learned_link_dto.g.dart';

@JsonSerializable()
class SearchLearnedLinkDto {
  const SearchLearnedLinkDto({
    required this.q,
    required this.practiceCode,
    required this.score,
  });

  factory SearchLearnedLinkDto.fromJson(Map<String, Object?> json) =>
      _$SearchLearnedLinkDtoFromJson(json);

  final String q;
  final String practiceCode;

  /// People who opened it after this query.
  final num score;

  Map<String, Object?> toJson() => _$SearchLearnedLinkDtoToJson(this);
}
