// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'search_index_status_dto.dart';

part 'search_index_status_envelope.g.dart';

@JsonSerializable()
class SearchIndexStatusEnvelope {
  const SearchIndexStatusEnvelope({required this.data, this.meta});

  factory SearchIndexStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$SearchIndexStatusEnvelopeFromJson(json);

  final SearchIndexStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SearchIndexStatusEnvelopeToJson(this);
}
