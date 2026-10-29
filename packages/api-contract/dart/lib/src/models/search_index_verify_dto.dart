// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'search_index_verify_dto_entity.dart';

part 'search_index_verify_dto.g.dart';

@JsonSerializable()
class SearchIndexVerifyDto {
  const SearchIndexVerifyDto({
    required this.entity,
    required this.live,
    required this.next,
    required this.sampled,
    required this.mismatched,
    required this.ok,
    this.note,
  });
  
  factory SearchIndexVerifyDto.fromJson(Map<String, Object?> json) => _$SearchIndexVerifyDtoFromJson(json);
  
  final SearchIndexVerifyDtoEntity entity;
  final num live;
  final num next;
  final num sampled;
  final num mismatched;
  final bool ok;
  final String? note;

  Map<String, Object?> toJson() => _$SearchIndexVerifyDtoToJson(this);
}
