// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'search_query_stat_dto.dart';

part 'search_query_stat_list_envelope.g.dart';

@JsonSerializable()
class SearchQueryStatListEnvelope {
  const SearchQueryStatListEnvelope({required this.data, this.meta});

  factory SearchQueryStatListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SearchQueryStatListEnvelopeFromJson(json);

  final List<SearchQueryStatDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SearchQueryStatListEnvelopeToJson(this);
}
